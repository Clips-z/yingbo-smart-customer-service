export function renderQianniuOfficialBridgePage(): string {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'self' https://g.alicdn.com; script-src 'self' 'unsafe-inline' https://g.alicdn.com; connect-src 'self'; style-src 'self' 'unsafe-inline'">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>迎波千牛桥接</title>
  <style>body{font:13px system-ui;margin:12px;color:#334155}#state{padding:8px;border-radius:6px;background:#f1f5f9}.ok{color:#047857}.bad{color:#b91c1c}</style>
</head>
<body>
  <div id="state">正在连接迎波智能客服…</div>
  <script charset="utf-8" src="https://g.alicdn.com/sj/qn/jssdk.js"></script>
  <script>
  (function () {
    'use strict';
    var root = location.pathname.replace(/\\\/$/, '');
    var clientId = 'yingbo-' + Date.now() + '-' + Math.random().toString(16).slice(2);
    var state = document.getElementById('state');
    var runtime = null;

    function show(message, ok) {
      state.textContent = message;
      state.className = ok ? 'ok' : 'bad';
    }

    function api(path, options) {
      return fetch(root + path, Object.assign({
        headers: { 'Content-Type': 'application/json' }
      }, options || {})).then(function (response) {
        return response.json().then(function (body) {
          if (!response.ok || body.success === false) {
            throw new Error(body.message || ('HTTP ' + response.status));
          }
          return body.data;
        });
      });
    }

    function invoke(cmd, param) {
      return new Promise(function (resolve, reject) {
        if (!window.QN || !QN.application) {
          reject(new Error('千牛 JSSDK 未注入'));
          return;
        }
        QN.application.invoke({
          cmd: cmd,
          param: param || {},
          success: function (rsp) { resolve(rsp || {}); },
          error: function (message) { reject(new Error(String(message || cmd + ' failed'))); }
        });
      });
    }

    function invokeMiniapp(method, param) {
      return new Promise(function (resolve, reject) {
        if (!window.my || !my.qn || typeof my.qn[method] !== 'function') {
          reject(new Error('千牛 PC 小程序 API 未注入'));
          return;
        }
        my.qn[method](Object.assign({}, param || {}, {
          success: function (rsp) { resolve(rsp || {}); },
          fail: function (rsp) {
            reject(new Error(String((rsp && (rsp.errorMessage || rsp.error)) || method + ' failed')));
          }
        }));
      });
    }

    function getActiveContact() {
      if (window.my && my.qn && typeof my.qn.imGetActiveUser === 'function') {
        return invokeMiniapp('imGetActiveUser', {});
      }
      return invoke('getActiveUser', {});
    }

    function insertText(contact, command) {
      var input = {
        uid: contact.userNick || command.userNick || '',
        securityUID: contact.securityUID,
        bizDomain: contact.bizDomain,
        text: command.content,
        type: 0
      };
      if (window.my && my.qn && typeof my.qn.imInsertText2Inputbox === 'function') {
        return invokeMiniapp('imInsertText2Inputbox', input);
      }
      return invoke('insertText2Inputbox', input);
    }

    function focusContact(command) {
      var input = {
        nick: command.userNick || '',
        securityUID: command.securityUID,
        bizDomain: command.bizDomain,
        sceneParam: '{"toRole":"buyer"}'
      };
      if (window.my && my.qn && typeof my.qn.openChat === 'function') {
        return invokeMiniapp('openChat', input);
      }
      return invoke('openChat', input);
    }

    function detectRuntime() {
      if (
        window.my && my.qn &&
        typeof my.qn.imGetActiveUser === 'function' &&
        typeof my.qn.imInsertText2Inputbox === 'function'
      ) return 'miniapp';
      if (window.QN && QN.application && QN.event) return 'legacy-jssdk';
      return null;
    }

    function normalizeContact(raw) {
      return {
        securityUID: String(raw.securityUID || raw.security_uid || '').trim(),
        bizDomain: String(raw.bizDomain || raw.biz_domain || 'taobao').trim(),
        userNick: String(raw.user_nick || raw.uid || raw.newContact || '').trim()
      };
    }

    function readContact() {
      return getActiveContact().then(normalizeContact).then(function (contact) {
        if (!contact.securityUID || !contact.bizDomain) {
          throw new Error('千牛未返回 securityUID/bizDomain');
        }
        return contact;
      });
    }

    function publishContact(contact) {
      return api('/contact', {
        method: 'POST',
        body: JSON.stringify(Object.assign({ clientId: clientId, runtime: runtime }, contact))
      }).then(function () {
        show('官方桥接已连接：' + (contact.userNick || contact.securityUID), true);
        return contact;
      });
    }

    function refreshContact() {
      return readContact().then(publishContact);
    }

    function registerContactEvents() {
      if (window.my && my.qn && typeof my.qn.onImActiveContactChanged === 'function') {
        my.qn.onImActiveContactChanged(function () {
          refreshContact().catch(function (error) { show(error.message, false); });
        });
        return;
      }
      if (!window.QN || !QN.event || !QN.event.regEvent) return;
      QN.event.regEvent({
        eventId: 'wangwang.active_contact_changed',
        notify: function () { refreshContact().catch(function (error) { show(error.message, false); }); }
      });
    }

    function complete(command, ok, error) {
      return api('/commands/' + encodeURIComponent(command.id) + '/complete', {
        method: 'POST',
        body: JSON.stringify({ clientId: clientId, ok: ok, error: error || '' })
      });
    }

    function execute(command) {
      if (command.type === 'focus') {
        return focusContact(command).then(function () {
          return complete(command, true, '');
        }).catch(function (error) {
          return complete(command, false, error.message).then(function () { throw error; });
        });
      }
      // Re-read the live contact for the safety check, but do not publish a
      // contact-change event here: doing so would invalidate the draft that
      // is currently being filled.
      return readContact().then(function (contact) {
        if (contact.securityUID !== command.securityUID || contact.bizDomain !== command.bizDomain) {
          throw new Error('填入前客户身份校验失败');
        }
        return insertText(contact, command);
      }).then(function () {
        return complete(command, true, '');
      }).catch(function (error) {
        return complete(command, false, error.message).then(function () { throw error; });
      });
    }

    function poll() {
      api('/commands?clientId=' + encodeURIComponent(clientId))
        .then(function (command) { return command ? execute(command) : null; })
        .catch(function (error) { show(error.message, false); })
        .finally(function () { setTimeout(poll, 200); });
    }

    function heartbeat() {
      api('/heartbeat', {
        method: 'POST',
        body: JSON.stringify({ clientId: clientId, runtime: runtime })
      }).catch(function (error) { show(error.message, false); });
    }

    function start(attempt) {
      runtime = detectRuntime();
      if (!runtime) {
        if (attempt < 20) {
          setTimeout(function () { start(attempt + 1); }, 250);
          return;
        }
        show('未检测到千牛官方 API，请从千牛测试应用内打开本页面', false);
        return;
      }
      registerContactEvents();
      heartbeat();
      setInterval(heartbeat, 1000);
      refreshContact().catch(function (error) { show(error.message, false); });
      poll();
    }

    window.addEventListener('load', function () {
      start(0);
    });
  }());
  </script>
</body>
</html>`;
}
