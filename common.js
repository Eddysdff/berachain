// utils/common.js

const fs = require('fs');
const path = require('path');

// 创建日志目录
const logDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir);
}

// 获取当前日期作为日志文件名
const getLogFileName = () => {
    const now = new Date();
    return `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}.log`;
};

// 自定义日志函数
const log = (...args) => {
    const now = new Date();
    const timestamp = now.toISOString();
    const message = args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg) : arg
    ).join(' ');
    
    const logMessage = `[${timestamp}] ${message}\n`;
    
    // 控制台输出
    console.log(logMessage);
    
    // 写入文件
    const logFile = path.join(logDir, getLogFileName());
    fs.appendFileSync(logFile, logMessage);
};

module.exports = {
    log
};

