from dotenv import load_dotenv
from core.config import initialize_config

from services.sync_account_list import sync_account_list as sync_account
from services.sync_crawler_accounts import sync_crawler_accounts as sync_crawler

# 環境変数の読み込み
load_dotenv()

# 設定の初期化
initialize_config()

# HTTP エントリーポイント関数


def sync_account_list(request):
    return sync_account(request)

def sync_crawler_accounts(request):    
    return sync_crawler(request)
