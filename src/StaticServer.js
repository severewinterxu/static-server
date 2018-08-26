const http = require('http');
const url = require('url');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const zlib = require('zlib');

const {promisify, inspect} = require('util');
const stat = promisify(fs.stat);
const readdir = promisify(fs.readdir);

const config = require('./config');
const {mimeType, expires, compress} = require('./setting');
const {parseRange, getNewPort} = require('./utils');

class StaticServer {
  /**
   * 静态服务器初始化
   * @param {Object} argv
   */
  constructor (argv) {
    this.config = Object.assign({}, config, argv);
    const server = http.createServer(this.handleRequest.bind(this));

    getNewPort(this.config.host, this.config.port).then(port => {
      server.listen(port, this.config.host, () => {
        console.log(`server started at ${this.config.host}:${port}`);
      });
    });
  }

  /**
   * 处理请求
   * @param {Object} request
   * @param {Object} response
   */
  async handleRequest (request, response) {
    const {pathname} = url.parse(request.url);
    const filepath = path.join(this.config.workspace, pathname);
    try {
      const stats = await stat(filepath);
      if (stats.isDirectory()) {
        const defaultFilePath = path.join(filepath, this.config.defaultPage);
        if (!this.config.viewDir && fs.existsSync(defaultFilePath)) {
          const defaultFileStats = await stat(defaultFilePath);
          this.handleContent(request, response, defaultFilePath, defaultFileStats);
        } else {
          this.renderFileListHTML(response, pathname, filepath);
        }
      } else if (stats.isFile()) {
        this.handleContent(request, response, filepath, stats);
      }
    } catch (error) {
      console.error(inspect(error));

      let statusCode, statusMessage, body;
      if (error.code === 'ENOENT') {
        statusCode = 404;
        statusMessage = 'Not Found';
        body = `<p>The requested URL ${pathname} was not found on this server.</p>`;
      } else {
        statusCode = 500;
        statusMessage = 'Server Error';
        body = '';
      }
      this.sendError(response, statusCode, statusMessage, body);
    }
  }

  /**
   * 显示请求目录下的所有文件
   * @param {Object} response
   * @param {string} pathname
   * @param {string} filepath
   */
  async renderFileListHTML (response, pathname, filepath) {
    pathname !== '/' && (pathname = pathname.slice(0, -1));
    let html = `<!DOCTYPE html>
    <html>
      <head>
        <title>Index of ${pathname}</title>
      </head>
      <body>
        <h1>Index of ${pathname}</h1>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Last modified</th>
              <th>Size</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td colspan="3">
                <hr />
              </td>
            </tr>`;

    if (pathname !== '/') {
      let parentPath = path.dirname(pathname);
      parentPath !== '/' && (parentPath += '/');
      html += `<a href="${parentPath}">Parent Directory</a>`;
    }

    let files = await readdir(filepath);
    for (let filename of files) {
      let url = path.join(pathname, filename);
      const fileStats = await stat(path.join(this.config.workspace, url));
      let size = fileStats.size;
      if (fileStats.isDirectory()) {
        url += '/';
        filename += '/';
        size = '-';
      }
      html += `<tr>
        <td style="text-align: right"><a href="${url}">${filename}</td>
        <td style="text-align: right">${new Date(fileStats.mtime).toLocaleString()}</td>
        <td style="text-align: right">${size}</td>
      </tr>`;
    };
    html += `<tr>
              <td colspan="3"><hr /></td>
            </tr>
          </tbody>
        </table>
      </body>
    </html>`;
    response.writeHead(200, 'OK', {'Content-Type': 'text/html'});
    response.end(html);
  }

  /**
   * 显示静态文件内容
   * @param {Object} request
   * @param {Object} response
   * @param {string} filepath
   * @param {fs.Stats} stats
   * @param {string} ext
   */
  handleContent (request, response, filepath, stats) {
    let {ext} = path.parse(filepath);
    ext = ext ? ext.slice(1) : 'unknown';

    if (this.config.useCache && this.handleCache(request, response, stats, ext)) { return; }

    const raw = this.getReadStream(request, response, stats.size, filepath);
    raw && this.compressHandle(request, response, ext, raw);
  }

  /**
   * 缓存
   * @param {Object} request
   * @param {Object} response
   * @param {fs.Stats} stats
   * @param {string} ext
   * @returns {boolean}
   */
  handleCache (request, response, stats, ext) {
    if (expires.fileMatch.test(ext)) {
      const expiresDate = new Date();
      expiresDate.setTime(expiresDate.getTime() + expires.maxAge * 1000);
      response.setHeader('Expires', expiresDate.toUTCString());
      response.setHeader('Cache-Control', 'max-age=' + expires.maxAge);
    }

    const lastModified = stats.mtime.toUTCString();
    let hashString = `${stats.mtimeMs + stats.size}`;
    let etag = crypto.createHash('md5').update(hashString).digest('base64');
    response.setHeader('Last-Modified', lastModified);
    response.setHeader('ETag', etag);

    const ifModifiedSince = request.headers['if-modified-since'];
    const ifNoneMatch = request.headers['if-none-match'];
    if ((!ifModifiedSince || !ifNoneMatch) || (ifModifiedSince && ifModifiedSince !== lastModified) || (ifNoneMatch && ifNoneMatch !== etag)) {
      return false;
    } else {
      response.writeHead('304', 'Not Modified');
      response.end();
      return true;
    }
  }

  /**
   * 获取可读流
   * @param {Object} request
   * @param {Object} response
   * @param {string} contentType
   * @param {bigint} size
   * @param {string} filepath
   * @returns {fs.ReadStream|null}
   */
  getReadStream (request, response, size, filepath) {
    const range = request.headers['range'];
    if (range) {
      let start = 0;
      let end = size - 1;

      const result = parseRange(range, size);
      if (result) {
        start = result.start;
        end = result.end;
        response.setHeader('Accept-Ranges', 'bytes');
        response.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
        response.setHeader('Content-Length', end - start + 1);
        response.statusCode = 206;
        response.statusMessage = 'Partial Content';
        return fs.createReadStream(filepath, {start: start, end: end});
      } else {
        this.sendError(response, 416, 'Request Range Not Satisfiable');
        return null;
      }
    } else {
      response.statusCode = 200;
      response.statusMessage = 'OK';
      return fs.createReadStream(filepath);
    }
  }

  /**
   * 压缩
   * @param {Object} request
   * @param {Object} response
   * @param {string} ext
   * @param {fs.ReadStream} raw
   */
  compressHandle (request, response, ext, raw) {
    const contentType = mimeType[ext] || 'text/plain';
    response.setHeader('Content-Type', contentType);

    let stream = raw;
    if (this.config.useCompress && compress.match.test(ext)) {
      const acceptEncoding = request.headers['accept-encoding'] || '';
      if (/\bgzip\b/.test(acceptEncoding)) {
        response.setHeader('Content-Encoding', 'gzip');
        stream = raw.pipe(zlib.createGzip());
      } else if (/\bdeflate\b/.test(acceptEncoding)) {
        response.setHeader('Content-Encoding', 'deflate');
        stream = raw.pipe(zlib.createDeflate());
      }
    }
    stream.pipe(response);
  }

  /**
   * 当客户端请求或服务器响应出现错误，将显示错误页面
   * @param {Object} response
   * @param {number} statusCode
   * @param {string} statusMessage
   * @param {string} body
   */
  sendError (response, statusCode, statusMessage, body) {
    response.writeHead(statusCode, statusMessage, {'Content-Type': 'text/html'});
    response.write(`<title>${statusCode} ${statusMessage}</title>`);
    response.write(`<h1>${statusMessage}</h1>`);
    response.end(body);
  }
}

module.exports = StaticServer;
