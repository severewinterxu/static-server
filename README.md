# 静态服务器
## 安装
    npm install
    npm link
## 使用方法
1. 可以使用任意目录作为工作区，只需在对应目录下执行`static-server`即可。
2. 可以在项目目录下执行`npm start`，默认将程序根目录下assets目录作为工作区。
## 参数
执行`static-server`命令可以附加参数以覆盖默认参数，参数如下：

    static-server [options]

    选项：
      -w, --workspace  静态文件根目录 [字符串] [默认值: 执行命令时所在的目录]
      -a, --host       配置监听的主机 [字符串] [默认值: "localhost"]
      -p, --port       配置端口号     [数字]  [默认值: 8080]
      -h               显示帮助信息 
    示例：
      static-server -w / -p 8080 -a localhost  使用目录/作为工作区，在本机8080的端口上监听客户端的请求
