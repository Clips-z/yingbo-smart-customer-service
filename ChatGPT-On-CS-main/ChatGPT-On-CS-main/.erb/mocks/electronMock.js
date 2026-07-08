module.exports = {
  safeStorage: {
    encryptString: function (s) { return Buffer.from(s); },
    decryptString: function (b) { return b.toString(); },
  },
  BrowserWindow: function () {
    return { webContents: { send: function () {} }, isDestroyed: function () { return false; } };
  },
};
