const path = require('path');

const config = {
  // 工作区
  workspace: path.join(__dirname, '../', 'assets'),
  // 服务器地址
  host: 'localhost',
  // 服务器端口
  port: 8080,
  // 默认主页
  defaultPage: 'page.html',
  // 请求目录时，是否显示目录下的文件
  viewDir: false,
  // 是否启用缓存
  useCache: true,
  // 是否启用压缩
  useCompress: true
};

module.exports = config;
