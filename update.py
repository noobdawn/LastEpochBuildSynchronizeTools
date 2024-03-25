import os
import requests
import time
import threading
import hashlib

# 待下载的文件列表
file_list_url = ""

request = requests.get(file_list_url)
if request.status_code != 200:
    print("无法获取文件列表")
    exit(1)

# 转换为utf-8编码
request.encoding = "utf-8"
file_list = request.text.split("\n")
file_list = [x for x in file_list if x != ""]
md5_list = [x.split("----")[1] for x in file_list]
file_list = [x.split("----")[0] for x in file_list]

# 下载文件
download_url = ""
suc, fail = [0, 0]

# 下载线程
def dl_file(url, filename):
    global suc, fail
    response = requests.get(url)
    if response.status_code != 200:
        fail += 1
        print(f"下载失败：{filename}")
    else:
        with open(filename, "wb") as f:
            f.write(response.content)
        suc += 1
        print(f"下载成功：{filename}")

def dl_files(filenames):
    global suc, fail
    for idx in range(len(filenames)):
        filename = filenames[idx]
        url = download_url + filename
        t = threading.Thread(target=dl_file, args=(url, filename))
        t.start()
        time.sleep(0.1)


# 计算文件的MD5值
def calculate_md5(file_path):
    with open(file_path, 'rb') as file:
        md5_hash = hashlib.md5()
        while chunk := file.read(8192):
            md5_hash.update(chunk)
        return md5_hash.hexdigest()

# 检查文件是否需要更新
need_updates = []
for idx in range(len(file_list)):
    filename = file_list[idx]
    md5 = md5_list[idx].strip()
    if os.path.exists(filename) and os.path.isfile(filename):
        lmd5 = calculate_md5(filename)
        if md5 == lmd5:
            continue
    need_updates.append(filename)

# 下载文件
dl_files(need_updates)
print(f"下载完成，成功{suc}个，失败{fail}个")
# 输入任意键退出
print("按任意键退出")
while True:
    input()
    break