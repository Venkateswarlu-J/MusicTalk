import os
import shutil
import tempfile
from fastapi import APIRouter, UploadFile, File

router = APIRouter()

# I will just write a patch script to update main.py of recognition-service
