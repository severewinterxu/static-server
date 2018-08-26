const net = require('net');

/**
 * 解析请求头Range，获取数据字节范围
 * @param {string} rangeStr
 * @param {bigint} size
 * @returns {object}
 */
function parseRange (rangeStr, size) {
  const range = rangeStr.split('-');
  let start = parseInt(range[0], 10);
  let end = parseInt(range[1], 10);
  if (isNaN(start)) {
    start = size - end;
    end = size - 1;
  } else if (isNaN(end)) {
    end = size - 1;
  }
  if (isNaN(start) || isNaN(end) || start > end || end >= size) {
    return;
  }

  return {
    start: start,
    end: end
  };
}

/**
 * 获取未被占用的服务器端口
 * @param {string} host
 * @param {number} port
 * @returns {number}
 */
async function getNewPort (host, port) {
  const p = await portIsOccupied(host, port);
  return p;
}

/**
 * 检测服务器端口是否被占用，如占用，将获取新端口使用。
 * @param {string} host
 * @param {string} port
 */
function portIsOccupied (host, port) {
  const server = net.createServer().listen(port, host);
  return new Promise((resolve, reject) => {
    server.on('listening', () => {
      server.close();
      resolve(port);
    });
    server.on('error', error => {
      if (error.code === 'EADDRINUSE') {
        resolve(portIsOccupied(host, port + 1));
      } else {
        reject(error);
      }
    });
  });
};

module.exports = {
  parseRange,
  getNewPort
};
