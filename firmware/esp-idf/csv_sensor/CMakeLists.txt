# Minimal ESP-IDF project. Build and flash with:
#   idf.py set-target esp32   (or esp32s3, esp32c3, ...)
#   idf.py build flash
cmake_minimum_required(VERSION 3.16)
include($ENV{IDF_PATH}/tools/cmake/project.cmake)
project(csv_sensor)
