from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from selenium_stealth import stealth
from tiktok_captcha_solver import make_undetected_chromedriver_solver  # CAPTCHAソルバー用
from ..logger import setup_logger

logger = setup_logger(__name__)

class SeleniumManager:
    def __init__(self, proxy: str = None, sadcaptcha_api_key: str = None):
        self.driver = None
        self.proxy = proxy
        self.sadcaptcha_api_key = sadcaptcha_api_key

    def setup_driver(self):
        try:
            # 共通のオプション設定
            options = Options()
            if self.proxy:
                options.add_argument(f'--proxy-server={self.proxy}')
            
            # その他の設定
            options.add_argument('--no-sandbox')
            options.add_argument('--use-angle=gl')
            options.add_argument('--enable-features=Vulkan')
            options.add_argument('--disable-vulkan-surface')
            options.add_argument('--enable-gpu-rasterization')
            options.add_argument('--enable-zero-copy')
            options.add_argument('--ignore-gpu-blocklist')
            options.add_argument('--enable-hardware-overlays')
            options.add_argument('--enable-features=VaapiVideoDecoder')
            options.add_argument('--mute-audio')
            options.add_argument('--start-maximized')

            if self.sadcaptcha_api_key:
                # CAPTCHA Solver使用時
                logger.info("CAPTCHA Solver付きのドライバーを作成します")
                self.driver = make_undetected_chromedriver_solver(
                    self.sadcaptcha_api_key,
                    options=options  # オプションを渡す
                )
            else:
                # 通常のSeleniumドライバーを使用
                service = Service()
                self.driver = webdriver.Chrome(service=service, options=options)
            
            # 共通の設定
            stealth(
                self.driver,
                languages=["ja-JP", "ja"],
                vendor="Google Inc.",
                platform="Win32",
                webgl_vendor="WebKit",
                renderer="WebKit WebGL",
                fix_hairline=True,
            )
            
            # WebDriver検出防止のJavaScript
            self.driver.execute_script(
                "Object.defineProperty(navigator, 'webdriver', {get: () => undefined})"
            )
            
            logger.info("Chromeドライバーの設定が完了しました")
            return self.driver
        
        except Exception as e:
            logger.error(f"Chromeドライバーの設定中にエラーが発生しました: {e}")
            raise

    def check_and_solve_captcha(self):
        """CAPTCHAが存在するかチェックし、存在する場合は解決を試みる"""
        if not self.solver:
            return False

        try:
            if self.solver.captcha_is_present():
                logger.info("CAPTCHAを検出しました。解決を試みます...")
                captcha_type = self.solver.identify_captcha()
                
                if captcha_type == "PUZZLE_V1":
                    self.solver.solve_puzzle()
                elif captcha_type == "ROTATE_V1":
                    self.solver.solve_rotate()
                elif captcha_type == "SHAPES_V1":
                    self.solver.solve_shapes()
                elif captcha_type == "ICON_V1":
                    self.solver.solve_icon()
                elif captcha_type == "PUZZLE_V2":
                    self.solver.solve_puzzle_v2()
                elif captcha_type == "ROTATE_V2":
                    self.solver.solve_rotate_v2()
                
                logger.info("CAPTCHAの解決が完了しました")
                return True
            
            return False

        except Exception as e:
            logger.error(f"CAPTCHA解決中にエラーが発生しました: {e}")
            return False

    def quit_driver(self):
        if self.driver:
            self.driver.quit()
            logger.info("Chromeドライバーを終了しました")
