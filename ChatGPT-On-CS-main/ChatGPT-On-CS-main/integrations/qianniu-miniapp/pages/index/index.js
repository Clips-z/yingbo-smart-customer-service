var API_ROOT = 'http://127.0.0.1:9999/api/v1/compat/qianniu/official-bridge';

function normalizeContact(raw) {
  raw = raw || {};
  return {
    securityUID: String(raw.securityUID || raw.security_uid || '').trim(),
    bizDomain: String(raw.bizDomain || raw.biz_domain || 'taobao').trim(),
    userNick: String(raw.user_nick || raw.uid || raw.newContact || '').trim(),
  };
}

Page({
  data: {
    connected: false,
    statusText: '正在检测千牛官方 API…',
    contactText: '',
  },

  onLoad: function () {
    this.clientId = 'yingbo-miniapp-' + Date.now() + '-' + Math.random().toString(16).slice(2);
    this.stopped = false;
    this.commandBusy = false;
    if (!my.qn || !my.qn.imGetActiveUser || !my.qn.imInsertText2Inputbox || !my.qn.openChat) {
      this.setData({ statusText: '当前容器未提供完整千牛 PC API' });
      return;
    }
    this.registerContactEvent();
    this.publishActiveContact();
    this.heartbeat();
    this.heartbeatTimer = setInterval(this.heartbeat.bind(this), 1000);
    this.pollCommands();
  },

  onUnload: function () {
    this.stopped = true;
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.pollTimer) clearTimeout(this.pollTimer);
  },

  request: function (path, method, data) {
    return new Promise(function (resolve, reject) {
      my.request({
        url: API_ROOT + path,
        method: method || 'GET',
        headers: { 'Content-Type': 'application/json' },
        data: data || {},
        success: function (response) {
          var body = response.data || {};
          if (response.status >= 400 || body.success === false) {
            reject(new Error(body.message || '本地桥接请求失败'));
            return;
          }
          resolve(body.data);
        },
        fail: function (error) {
          reject(new Error((error && error.errorMessage) || '无法连接迎波智能客服'));
        },
      });
    });
  },

  qnCall: function (method, params) {
    return new Promise(function (resolve, reject) {
      var input = Object.assign({}, params || {}, {
        success: function (result) { resolve(result || {}); },
        fail: function (error) {
          reject(new Error((error && (error.errorMessage || error.error)) || method + ' failed'));
        },
      });
      my.qn[method](input);
    });
  },

  getActiveContact: function () {
    return this.qnCall('imGetActiveUser', {}).then(normalizeContact).then(function (contact) {
      if (!contact.securityUID || !contact.bizDomain) {
        throw new Error('千牛未返回 securityUID/bizDomain');
      }
      return contact;
    });
  },

  heartbeat: function () {
    var self = this;
    this.request('/heartbeat', 'POST', {
      clientId: this.clientId,
      runtime: 'miniapp',
    }).then(function () {
      self.setData({ connected: true, statusText: '官方桥接已连接' });
    }).catch(function (error) {
      self.setData({ connected: false, statusText: error.message });
    });
  },

  publishActiveContact: function () {
    var self = this;
    return this.getActiveContact().then(function (contact) {
      return self.request('/contact', 'POST', Object.assign({
        clientId: self.clientId,
        runtime: 'miniapp',
      }, contact)).then(function () {
        self.setData({
          connected: true,
          contactText: contact.userNick || contact.securityUID,
          statusText: '官方桥接已连接',
        });
        return contact;
      });
    }).catch(function (error) {
      self.setData({ connected: false, statusText: error.message });
      throw error;
    });
  },

  registerContactEvent: function () {
    var self = this;
    if (!my.qn.onImActiveContactChanged) return;
    my.qn.onImActiveContactChanged(function () {
      self.publishActiveContact().catch(function () {});
    });
  },

  completeCommand: function (command, ok, error) {
    return this.request('/commands/' + encodeURIComponent(command.id) + '/complete', 'POST', {
      clientId: this.clientId,
      ok: ok,
      error: error || '',
    });
  },

  executeCommand: function (command) {
    var self = this;
    if (command.type === 'focus') {
      return this.qnCall('openChat', {
        nick: command.userNick || '',
        securityUID: command.securityUID,
        bizDomain: command.bizDomain,
        sceneParam: '{"toRole":"buyer"}',
      });
    }
    return this.getActiveContact().then(function (contact) {
      if (contact.securityUID !== command.securityUID || contact.bizDomain !== command.bizDomain) {
        throw new Error('填入前客户身份校验失败');
      }
      return self.qnCall('imInsertText2Inputbox', {
        uid: contact.userNick || command.userNick || '',
        securityUID: contact.securityUID,
        bizDomain: contact.bizDomain,
        text: command.content,
        type: 0,
      });
    });
  },

  pollCommands: function () {
    var self = this;
    if (this.stopped) return;
    if (this.commandBusy) {
      this.pollTimer = setTimeout(this.pollCommands.bind(this), 200);
      return;
    }
    this.request('/commands?clientId=' + encodeURIComponent(this.clientId), 'GET')
      .then(function (command) {
        if (!command) return null;
        self.commandBusy = true;
        return self.executeCommand(command)
          .then(function () { return self.completeCommand(command, true, ''); })
          .catch(function (error) {
            return self.completeCommand(command, false, error.message).then(function () {
              throw error;
            });
          })
          .finally(function () { self.commandBusy = false; });
      })
      .catch(function (error) {
        self.setData({ connected: false, statusText: error.message });
      })
      .finally(function () {
        if (!self.stopped) self.pollTimer = setTimeout(self.pollCommands.bind(self), 200);
      });
  },
});
