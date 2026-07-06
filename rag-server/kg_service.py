"""
知识图谱增强服务
基于 LLM 的知识图谱实体关系抽取，增强 RAG 检索精度。
"""
import json
import hashlib
from typing import List, Dict, Optional, Tuple
from pathlib import Path
import pickle


class KnowledgeGraph:
    """
    轻量级知识图谱
    存储实体（Entity）和关系（Relation），支持图检索。
    """

    def __init__(self, cache_dir: Path):
        self.cache_dir = cache_dir
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self.cache_file = self.cache_dir / "knowledge_graph.pkl"

        # 实体: {name: {type, aliases, properties}}
        self.entities: Dict[str, dict] = {}
        # 关系: [(subject, predicate, object)]
        self.relations: List[Tuple[str, str, str]] = []

        self._load_cache()

    def add_entity(self, name: str, entity_type: str = "concept", aliases: List[str] = None, properties: dict = None):
        """添加实体"""
        if name not in self.entities:
            self.entities[name] = {
                "type": entity_type,
                "aliases": aliases or [],
                "properties": properties or {},
            }
        else:
            # 更新已有实体
            existing = self.entities[name]
            if aliases:
                existing["aliases"] = list(set(existing.get("aliases", []) + aliases))
            if properties:
                existing["properties"].update(properties)

    def add_relation(self, subject: str, predicate: str, obj: str):
        """添加关系"""
        relation = (subject, predicate, obj)
        if relation not in self.relations:
            self.relations.append(relation)

    def query_entity(self, name: str, include_related: bool = True) -> Optional[dict]:
        """查询实体及其关联"""
        entity = self.entities.get(name)
        if not entity:
            # 尝试别名匹配
            for ename, edata in self.entities.items():
                if name in edata.get("aliases", []):
                    entity = edata
                    name = ename
                    break
        if not entity:
            return None

        result = {"name": name, **entity}
        if include_related:
            result["relations"] = []
            for s, p, o in self.relations:
                if s == name:
                    result["relations"].append({"direction": "out", "predicate": p, "target": o})
                elif o == name:
                    result["relations"].append({"direction": "in", "predicate": p, "source": s})
        return result

    def search_relevant(self, query: str, top_k: int = 10) -> List[dict]:
        """
        根据查询搜索相关知识图谱条目。
        使用关键词匹配（简单但有效的方案）。
        """
        query_lower = query.lower()
        scored = []

        for name, data in self.entities.items():
            score = 0
            # 名称匹配
            if name.lower() in query_lower or query_lower in name.lower():
                score += 3
            # 别名匹配
            for alias in data.get("aliases", []):
                if alias.lower() in query_lower or query_lower in alias.lower():
                    score += 2
            # 属性匹配
            for key, value in data.get("properties", {}).items():
                val_str = str(value).lower()
                if val_str in query_lower or query_lower in val_str:
                    score += 1

            if score > 0:
                scored.append((name, data, score))

        scored.sort(key=lambda x: x[2], reverse=True)
        results = []
        for name, data, score in scored[:top_k]:
            entry = self.query_entity(name)
            if entry:
                entry["_score"] = score
                results.append(entry)
        return results

    def to_text_context(self, query: str, top_k: int = 10) -> str:
        """将知识图谱检索结果转换为文本上下文"""
        results = self.search_relevant(query, top_k)
        if not results:
            return ""

        lines = ["【知识图谱相关信息】"]
        for r in results:
            entity_type = r.get("type", "concept")
            lines.append(f"\n实体: {r['name']} (类型: {entity_type})")
            if r.get("aliases"):
                lines.append(f"  别名: {', '.join(r['aliases'])}")
            if r.get("properties"):
                props = ", ".join(f"{k}={v}" for k, v in r["properties"].items())
                lines.append(f"  属性: {props}")
            if r.get("relations"):
                for rel in r["relations"]:
                    if rel["direction"] == "out":
                        lines.append(f"  关系: → {rel['predicate']} → {rel['target']}")
                    else:
                        lines.append(f"  关系: {rel['source']} → {rel['predicate']} → {r['name']}")

        return "\n".join(lines)

    def save(self):
        """持久化到磁盘"""
        with open(self.cache_file, "wb") as f:
            pickle.dump({"entities": self.entities, "relations": self.relations}, f)

    def _load_cache(self):
        """从磁盘加载"""
        if self.cache_file.exists():
            try:
                with open(self.cache_file, "rb") as f:
                    data = pickle.load(f)
                    self.entities = data.get("entities", {})
                    self.relations = data.get("relations", [])
            except Exception:
                pass

    def clear(self):
        """清空知识图谱"""
        self.entities.clear()
        self.relations.clear()
        if self.cache_file.exists():
            self.cache_file.unlink()


class KnowledgeGraphExtractor:
    """
    基于 LLM 的知识图谱实体关系抽取器。
    从知识库文档中自动提取实体和关系。
    """

    def __init__(self, kg: KnowledgeGraph, api_key: str, base_url: str = "https://api.siliconflow.cn/v1", model: str = "Qwen/Qwen2.5-7B-Instruct"):
        self.kg = kg
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.model = model

    async def extract_from_text(self, text: str, source: str = "document") -> int:
        """
        从文本中提取实体和关系，添加到知识图谱。
        返回提取的实体数量。
        """
        # 对长文本分批处理
        chunks = self._split_for_extraction(text, max_chars=3000)
        total_entities = 0

        for i, chunk in enumerate(chunks):
            entities, relations = await self._extract_chunk(chunk, source)
            for entity in entities:
                self.kg.add_entity(**entity)
            for rel in relations:
                self.kg.add_relation(**rel)
            total_entities += len(entities)

        self.kg.save()
        return total_entities

    def _split_for_extraction(self, text: str, max_chars: int = 3000) -> List[str]:
        """将长文本切分为适合 LLM 处理的块"""
        if len(text) <= max_chars:
            return [text]

        chunks = []
        paragraphs = text.split("\n\n")
        current = ""

        for para in paragraphs:
            if len(current) + len(para) > max_chars and current:
                chunks.append(current)
                current = para
            else:
                current = (current + "\n\n" + para).strip()

        if current:
            chunks.append(current)

        return chunks

    async def _extract_chunk(self, text: str, source: str) -> Tuple[List[dict], List[dict]]:
        """使用 LLM 从单个文本块中提取实体和关系"""
        import httpx

        prompt = f"""请从以下文本中提取实体和关系，以 JSON 格式返回。

文本来源: {source}

文本内容:
{text}

返回格式（严格 JSON，不要其他内容）:
{{
  "entities": [
    {{"name": "实体名称", "type": "product|policy|person|process|number|date|other", "aliases": ["别名1"], "properties": {{"key": "value"}}}}
  ],
  "relations": [
    {{"subject": "主体实体名", "predicate": "关系描述", "object": "客体实体名"}}
  ]
}}

注意:
- 只提取重要的实体（商品、政策、流程、关键人物等）
- 关系描述使用简洁的中文（如"属于"、"价格为"、"包含"、"适用于"等）
- 实体名称使用知识库中的标准表述
- 如果文本中没有明显的实体或关系，返回空数组"""

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    f"{self.base_url}/chat/completions",
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": self.model,
                        "messages": [{"role": "user", "content": prompt}],
                        "temperature": 0.1,
                        "max_tokens": 2000,
                    },
                )

                if response.status_code != 200:
                    print(f"[KG] LLM 请求失败: {response.status_code}")
                    return [], []

                data = response.json()
                content = data["choices"][0]["message"]["content"]

                # 解析 JSON
                json_match = None
                import re
                match = re.search(r"\{[\s\S]*\}", content)
                if match:
                    json_match = match.group(0)

                if not json_match:
                    return [], []

                result = json.loads(json_match)
                entities = result.get("entities", [])
                relations = result.get("relations", [])

                # 验证格式
                valid_entities = [
                    e for e in entities
                    if isinstance(e, dict) and "name" in e and e["name"].strip()
                ]
                valid_relations = [
                    r for r in relations
                    if isinstance(r, dict)
                    and "subject" in r and "predicate" in r and "object" in r
                    and r["subject"].strip() and r["predicate"].strip() and r["object"].strip()
                ]

                return valid_entities, valid_relations

        except Exception as e:
            print(f"[KG] 实体提取失败: {e}")
            return [], []
