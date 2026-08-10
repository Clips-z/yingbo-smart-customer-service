import React, { useEffect, useState } from 'react';
import { Center, Text } from '@chakra-ui/react';
import Loader from '../../components/Loader';

type FullScreenLoaderProps = {
  reconnecting?: boolean;
};

const FullScreenLoader = ({ reconnecting = false }: FullScreenLoaderProps) => {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    setElapsed(0);
    const timer = setInterval(() => {
      setElapsed((previous) => previous + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [reconnecting]);

  return (
    <Center h="100vh" w="100vw" bg="white" flexDirection="column">
      <Text fontSize="lg" mt="4" zIndex={10} pb={40}>
        {reconnecting
          ? '本地服务连接已中断，正在自动恢复…'
          : '正在启动本地服务，请稍候…'}
      </Text>
      <Text fontSize="sm" zIndex={10} color="gray.500">
        已等待 {elapsed} 秒
      </Text>
      {elapsed > 15 && (
        <Text fontSize="sm" zIndex={10} color="orange.500" mt={2}>
          服务恢复时间较长，正在重新连接本地组件…
        </Text>
      )}
      {elapsed > 30 && (
        <Text fontSize="sm" zIndex={10} color="red.500" mt={2}>
          如果持续超过 1 分钟，请重启迎波智能客服。
        </Text>
      )}
      <Loader />
    </Center>
  );
};

export default React.memo(FullScreenLoader);
