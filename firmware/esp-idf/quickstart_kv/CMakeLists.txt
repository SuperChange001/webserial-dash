# WebSerial Dash quick start (ESP-IDF v5.3+). Build and flash:
#   idf.py set-target esp32 && idf.py -p /dev/ttyUSB0 build flash
cmake_minimum_required(VERSION 3.16)
include($ENV{IDF_PATH}/tools/cmake/project.cmake)
project(quickstart_kv)
