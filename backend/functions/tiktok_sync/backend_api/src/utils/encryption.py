from cryptography.fernet import Fernet
import os
import base64

# 環境変数から暗号化キーを取得
ENCRYPTION_KEY = os.getenv("ENCRYPTION_KEY")

def get_cipher():
    """Fernetオブジェクトを取得"""
    if not ENCRYPTION_KEY:
        raise ValueError("ENCRYPTION_KEYが設定されていません")
    
    # キーが32バイトでない場合は調整
    key = ENCRYPTION_KEY.encode()
    key = base64.urlsafe_b64encode(key.ljust(32)[:32])
    return Fernet(key)

def encrypt_data(data):
    """データを暗号化"""
    if not data:
        return None
    
    cipher = get_cipher()
    return cipher.encrypt(data.encode()).decode()

def decrypt_data(encrypted_data):
    """暗号化されたデータを復号化"""
    if not encrypted_data:
        return None
    
    cipher = get_cipher()
    return cipher.decrypt(encrypted_data.encode()).decode()
