from setuptools import setup, find_packages

setup(
    name="tiktok_crawler",
    version="0.1.0",
    packages=find_packages(),
    install_requires=[
        "playwright==1.41.0",
        "python-dotenv==1.0.0",
        "mysql-connector-python==8.2.0",
        "google-cloud-pubsub==2.18.4",
    ],
) 