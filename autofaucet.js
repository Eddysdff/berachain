const fs = require('fs');
const { default: axios } = require('axios');
const { join } = require('path');
const { log } = require('./common.js');
const fakeUa = require('fake-useragent');
const { HttpsProxyAgent } = require('https-proxy-agent');

const proxyList = [
    "http://ptldrdsk:ptldrdsk@168.199.166.21:6553",
    "http://ptldrdsk:ptldrdsk@45.114.15.18:5999",
    "http://ptldrdsk:ptldrdsk@45.114.15.125:6106",
    "http://ptldrdsk:ptldrdsk@192.95.91.138:5765",
    "http://ptldrdsk:ptldrdsk@168.199.166.187:6719"
];

const { wallets } = require('./wallet.js');

const MAX_RETRIES = 3;
const MAX_PROXY_CHECK_ATTEMPTS = 3;

const websiteKey = '04d28d90-d5b9-4a90-94e5-a12c595bd4e2';
const faucetUrl = 'https://artio.faucet.berachain.com/api/claim';
const headers = {
    'authority': 'artio.faucet.berachain.com',
    'accept': 'application/json, text/plain,*/*',
    'accept-language': 'zh-CN,zh;q=0.9',
    'cache-control': 'no-cache',
    'content-type': 'application/json',
    'origin': 'https://artio.faucet.berachain.com',
    'pragma': 'no-cache',
    'referer': 'https://artio.faucet.berachain.com/',
    'user-agent': fakeUa(),
};

const clientKey = process.env.YES_CAPTCHA_API_KEY;

async function createTask(websiteUrl, websiteKey, taskType) {
    const url = 'https://api.yescaptcha.com/createTask';
    const params = {
        "clientKey": clientKey,
        "task": {
            "websiteURL": websiteUrl,
            "websiteKey": websiteKey,
            "type": taskType
        }
    }
    return await sendRequest(url, {method: 'post', data: params});
}

async function getTaskResult(taskId) {
    const url = 'https://api.yescaptcha.com/getTaskResult';
    const params = {
        clientKey: clientKey,
        taskId: taskId
    }

    const response_data = await sendRequest(url, {method: 'post', data: params});
    await sleep(12000); // 等待12秒
    if (response_data.status === 'ready') {
        return response_data;
    } else if (response_data.status === 'processing') {
        return await getTaskResult(taskId);
    }
}

async function solveCaptcha() {
    const { taskId } = await createTask(faucetUrl, websiteKey, 'HCaptchaTaskProxyless');
    let result = await getTaskResult(taskId);
    let retried = 0;
    while(!result && retried < 10) {
        result = await getTaskResult(taskId);
        retried++;
    }
   
    if (!result) {
        throw new Error(`人机验证失败`);
    }
    return result.solution.gRecaptchaResponse;
}

let claimed_at = {};

async function main() {
    console.log(`开始领取Berachain测试币.`);

    while (true) {
        try {
            for (let i = 0; i < wallets.length; i++) {
                try {
                    let address = wallets[i].address;
                    console.log(`[${i+1}] 处理地址 ${address}`);
                    
                    const proxyUrl = proxyList[i % proxyList.length];
                    const agent = new HttpsProxyAgent(proxyUrl);
                    
                    console.log(`使用代理: ${proxyUrl}`);

                    // 验证代理
                    let proxyVerified = false;
                    let proxyAttempts = 0;
                    while (!proxyVerified && proxyAttempts < MAX_PROXY_CHECK_ATTEMPTS) {
                        try {
                            const response = await sendRequest('https://myip.ipip.net', {
                                method: 'get', 
                                httpAgent: agent, 
                                httpsAgent: agent
                            });
                            console.log(`代理验证成功, IP信息: `, response);
                            proxyVerified = true;
                        } catch (error) {
                            proxyAttempts++;
                            console.log(`代理验证失败，等待10秒后重试`);
                            await sleep(10000);
                        }
                    }
                    
                    if (!proxyVerified) {
                        console.log(`代理验证失败，跳过当前地址`);
                        continue;
                    }
                    
                    let attempts = 0;
                    while (attempts < MAX_RETRIES) {
                        try {
                            let captchaToken = await solveCaptcha();
                            console.log('获取到验证码token:', captchaToken);

                            const data = {
                                address: address,
                                denom: 'TKNBERA',
                                h_captcha: captchaToken,
                            };
                            
                            const response = await axios.post(faucetUrl, data, {
                                headers: headers,
                                httpsAgent: agent,
                                httpAgent: agent,
                            });
                            
                            console.log(`领取成功✅ ${address}`, response.data);
                            attempts = MAX_RETRIES;
                        } catch (error) {
                            log(`error`, error);
                            if(error.response && error.response.data.msg) {
                                console.error(`领取失败❌，地址：${address}: ${error.response.data.msg}`);
                            }
                            attempts++;
                            if(attempts < MAX_RETRIES) {
                                console.log(`地址${address}正在重试第 ${attempts} 次...`);
                                await sleep(5000);
                            } else {
                                claimed_at[address] = new Date().valueOf();
                            }
                        }
                    }
                    const pauseTime = getRandomInt(200000, 1000000);
                    console.log(`任务完成，线程暂停${pauseTime/1000}秒`);
                    await sleep(pauseTime);
                } catch (e) {
                    log(`error. ${e}`);
                }
            }
            log(`完成一轮, 休息8小时`);
            await sleep(8 * 60 * 60 * 1000);
        } catch (e) {
            log(`error.`, e);
        }
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function sendRequest(url, urlConfig, timeout = 30000) {
    const source = axios.CancelToken.source();
    const timer = setTimeout(() => {
        source.cancel(`Request timed out after ${timeout} ms`);
    }, timeout);

    const newConfig = {
        ...urlConfig,
        url: url,
        timeout: timeout,
        cancelToken: source.token,
        method: urlConfig.method || 'get',
        onDownloadProgress: () => clearTimeout(timer),
    };

    try {
        const response = await axios(newConfig);
        if(response && response.data) {
            return response.data;
        } else {
            throw 'request error';
        }
    } catch (error) {
        log(error, error);
        throw error;
    }
}

function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

main().catch(console.error);
