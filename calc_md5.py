import os
import hashlib

def calculate_md5(file_path):
    with open(file_path, 'rb') as file:
        md5_hash = hashlib.md5()
        while chunk := file.read(8192):
            md5_hash.update(chunk)
        return md5_hash.hexdigest()

def calculate_md5_for_all_files():
    current_dir = os.getcwd()
    blacklist_file = os.path.join(current_dir, 'blacklist.txt')
    blacklist = set()

    # 读取黑名单文件
    if os.path.isfile(blacklist_file):
        with open(blacklist_file, 'r') as f:
            for line in f:
                file_name = line.strip()
                blacklist.add(file_name)

    with open('hash.txt', 'w', encoding='utf-8') as f:
        for file_name in os.listdir(current_dir):
            file_path = os.path.join(current_dir, file_name)
            if os.path.isfile(file_path) and file_name not in blacklist:
                md5 = calculate_md5(file_path)
                f.write(f"{file_name}----{md5}\n")

calculate_md5_for_all_files()
