from fastapi import APIRouter, Depends, HTTPException, status, Request, Response, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from typing import Optional
from datetime import datetime, timedelta
from src.db.database import execute_query, fetch_one, execute_update, get_db
from .models import UserCreate, User, Token, Session, PasswordChange
from .utils import (
    verify_password,
    get_password_hash,
    create_access_token,
    verify_token,
    generate_uuid,
    create_session,
    create_verification_token
)
import httpx, os, time, jwt
from src.my_report.repositories import TikTokRepository, TikTokUserConnection as RepoTikTokUserConnection
from src.my_report.tiktok_sync import schedule_initial_sync
from src.utils.encryption import encrypt_data, decrypt_data
import uuid
import secrets
