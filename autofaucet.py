import cloudscraper
import time
from datetime import datetime
import pandas as pd
from apscheduler.schedulers.background import BackgroundScheduler
import json
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
import sys

def load_addresses_and_proxies(excel_file):
    addresses_proxies = []
    try:
        df = pd.read_excel(excel_file)
        for index, row in df.iterrows():
            addresses_proxies.append((row['address'], row['proxy'], row['username'], row['password']))
    except Exception as e:
        print(f"读取Excel文件时发生错误: {str(e)}")
        raise
    return addresses_proxies

def format_proxy(proxy, username, password):
    if username and password:
        proxy_parts = proxy.split('://')
        return f"{proxy_parts[0]}://{username}:{password}@{proxy_parts[1]}"
    return proxy

def check_proxy(proxy, username, password):
    formatted_proxy = format_proxy(proxy, username, password)
    proxies = {"http": formatted_proxy, "https": formatted_proxy}
    try:
        response = requests.get("https://httpbin.org/ip", proxies=proxies, timeout=10)
        if response.status_code == 200:
            print(f"代理 {proxy} 可用")
            return True
    except Exception as e:
        print(f"代理 {proxy} 不可用: {str(e)}")
    return False

def create_session_with_retries():
    session = requests.Session()
    retries = Retry(total=5,
                    backoff_factor=0.1,
                    status_forcelist=[500, 502, 503, 504])
    session.mount('https://', HTTPAdapter(max_retries=retries))
    return session

def claim_faucet(address, proxy, username, password):
    url = "https://bartio-faucet.berachain-devnet.com/api/claim"
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
        "Accept": "*/*",
        "Accept-Language": "zh-CN,zh;q=0.9",
        "Content-Type": "application/json",
        "Origin": "https://bartio.faucet.berachain.com",
        "Referer": "https://bartio.faucet.berachain.com/",
        "Authorization": "Bearer ACTUAL_TOKEN_HERE",  # 请替换为实际的令牌
        "sec-ch-ua": '"Google Chrome";v="129", "Not=A?Brand";v="8", "Chromium";v="129"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"Windows"',
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "cross-site"
    }
    data = {"address": address, "denom": "TKNBERA"}  # 添加 denom 参数
    
    formatted_proxy = format_proxy(proxy, username, password)
    proxies = {"http": formatted_proxy, "https": formatted_proxy}

    session = create_session_with_retries()

    try:
        response = session.post(url, headers=headers, json=data, proxies=proxies, timeout=60)
        
        print(f"请求 URL: {response.url}")
        print(f"请求头: {response.request.headers}")
        print(f"请求体: {response.request.body}")
        print(f"响应状态码: {response.status_code}")
        print(f"响应内容: {response.text}")

        if response.status_code == 200:
            try:
                response_data = response.json()
                if response_data.get("success"):
                    print(f"{datetime.now()} - 成功为地址 {address} 领水")
                else:
                    print(f"{datetime.now()} - 为地址 {address} 领水失败，原因: {response_data.get('message', '未知错误')}")
            except json.JSONDecodeError:
                print(f"{datetime.now()} - 无法解析响应 JSON: {response.text}")
        elif response.status_code == 400:
            print(f"{datetime.now()} - 请求错误 (400)，可能是参数问题。请检查请求格式和内容。")
        elif response.status_code == 401:
            print(f"{datetime.now()} - 未授权 (401)，请检查 Authorization 令牌。")
        elif response.status_code == 429:
            print(f"{datetime.now()} - 请求过于频繁，请稍后再试")
            time.sleep(60)  # 如果遇到频率限制，等待60秒
        else:
            print(f"{datetime.now()} - 为地址 {address} 领水失败，状态码: {response.status_code}")
    
    except requests.exceptions.RequestException as e:
        print(f"{datetime.now()} - 请求异常: {str(e)}")
    except Exception as e:
        print(f"{datetime.now()} - 为地址 {address} 领水时发生错误: {str(e)}")

def main_claim_process():
    print(f"{datetime.now()} - 开始执行领水过程...")
    try:
        addresses_proxies = load_addresses_and_proxies("address.xlsx")
        for address, proxy, username, password in addresses_proxies:
            try:
                claim_faucet(address, proxy, username, password)
            except Exception as e:
                print(f"处理地址 {address} 时发生错误: {str(e)}")
            time.sleep(60)  # 增加请求间隔到60秒，以避免触发频率限制
    except Exception as e:
        print(f"执行过程中发生错误: {str(e)}")
    print(f"{datetime.now()} - 领水过程执行完毕")

if __name__ == "__main__":
    print("自动领水脚本已启动...")
    try:
        main_claim_process()
    except KeyboardInterrupt:
        print("\n脚本被用户中断。正在安全退出...")
        sys.exit(0)
