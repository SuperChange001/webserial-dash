# WebSerial Dash Wi-Fi RSSI + speed test (ESP-IDF v5.3+), matches dashboards/wifi-speedtest.json.
#   idf.py set-target esp32 && idf.py -p /dev/ttyUSB0 build flash
# Then, in the dashboard terminal:  wifi <ssid> <password>
cmake_minimum_required(VERSION 3.16)
include($ENV{IDF_PATH}/tools/cmake/project.cmake)
project(wifi_speedtest)
