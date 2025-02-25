def extract_account_id(url: str) -> str:
    """URLからアカウント名を抽出する"""
    import re
    match = re.search(r'@([^/]+)', url)
    return match.group(1) if match else '' 