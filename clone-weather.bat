@echo off
echo Removing old directory...
rmdir /s /q "C:\Users\tuan_\.qclaw\workspace\skills\feishu-weather-a-parser"
echo Cloning repository...
git clone https://github.com/andyy1976/feishu-weather-a-parser.git "C:\Users\tuan_\.qclaw\workspace\skills\feishu-weather-a-parser"
echo Done!
pause
