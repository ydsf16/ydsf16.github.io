---
type: note
title: "[Phone AI] 手机变数据采集器"
lang: zh
date: 2026-07-02
updated: 2026-07-02
status: "已发布"
featured: false
priority: -1
tags: [数据采集, SLAM, 具身智能, IMU, GNSS]
categories: [Phone AI, 技术笔记]
draft: false
source:
  platform: 知乎
  type: article
  url: https://zhuanlan.zhihu.com/p/2056025596623431002
relatedProducts: [sensor-recorder-pro]
relatedProjects: [robotics-experiments]
---

最近做了一个 iPhone 多传感器数据记录工具：**Sensor Recorder Pro**。目标是把手机变成一个低成本的真实世界数据采集器。

当前支持 iPhone（iOS），可以同步记录两路相机视频、音频、IMU、Motion、GNSS 等多源数据，并导出为规范的数据文件。

这篇文章主要聊三个问题：

- 为什么手机值得被当成一个数据采集平台？
- 为什么具身智能、Physical AI、机器人、XR 和科学实验都需要多传感器数据？
- Sensor Recorder Pro 目前做了什么，后续还想做什么？

![Sensor Recorder Pro](/media/notes/phone-as-sensor-recorder-pro/overview.png)

App 名称：[Sensor Recorder Pro](https://apps.apple.com/us/app/sensor-recorder-pro/id6782758613?l=zh-Hans-CN)  
GitHub 开源代码：[ydsf16/ios_sensor_recorder](https://github.com/ydsf16/ios_sensor_recorder)

## 手机：被低估的真实世界数据入口

手机本身就是一个高度集成的多传感器计算平台。它通常包含相机、麦克风、IMU、GNSS、磁力计、气压计；部分高端设备还提供 LiDAR 或深度信息。同时，手机具备边缘计算能力、成熟的权限管理、存储和网络能力。

这意味着我们可以直接利用现成设备采集真实世界数据，减少专用硬件开发和维护成本，让更多低成本实验成为可能。

相比于从零开始设计、开模和调试一套专用硬件采集设备，直接利用手机可以快速部署，使用门槛低，且传感器与端侧算力还在持续增强。在很多真实世界的数据采集任务中，我们不一定需要先造硬件，把手机里的传感器和算力利用起来，就能以较低成本完成第一轮实验闭环。

Sensor Recorder Pro 就是基于这个想法迈出的第一步：先从 iPhone 平台开始，把手机变成一个开箱即用、数据可导出、实验可复现的多传感器数据采集器。

## 为什么需要多传感器数据？

大模型的发展依赖数据规模，也依赖数据形态。具身智能、Physical AI、机器人和 XR 系统面对的是持续变化的真实世界，单一模态很难完整描述一个场景。视频、音频、位置、运动状态和惯性数据需要在统一时间轴上协同记录，才能支持后续的感知、定位、建图、控制和训练。

### 具身智能与 Physical AI

具身智能需要从物理环境中获得连续的视觉、动作和状态信息。手机可以作为轻量的数据采集端，为动作理解、环境感知和多模态模型提供真实样本。

在第一人称视角（Ego-centric AI）数据方向上，许多研究会通过挂脖或头部支架将手机作为采集终端，记录人类日常行为，再在云端进行数据清洗和基础物理模型训练。Sensor Recorder Pro 希望补上其中一块：方便地采集多传感器原始数据，为后续算法提供数据基础。

![AoE: Always-on Egocentric Human Video Collection for Embodied AI](/media/notes/phone-as-sensor-recorder-pro/aoe.jpg)

### 机器人

机器人系统需要视觉、惯性、位置和运动信息之间的时间关系。高质量的同步数据可以用于 VIO、SLAM、运动分析、传感器标定和算法验证。

手机也可以直接固连在低成本移动机器人本体上，例如四足机器人、轮式底盘或无人机，同时作为传感器源与临时计算平台，以较低成本快速验证原型。

![机器人数据采集示例](/media/notes/phone-as-sensor-recorder-pro/robot.jpg)

### XR / AR / VR

XR 设备需要理解用户的头部和身体运动，也需要理解周围的空间。相机、IMU、Motion 和 GNSS 等数据可以帮助研究空间定位、姿态估计和交互体验。

Sensor Recorder Pro 当前更关注底层原始数据的记录。相比高度封装的空间框架输出，原始数据更适合验证自定义的空间计算、场景重建和传感器融合方法。

![XR / AR / VR 数据采集示例](/media/notes/phone-as-sensor-recorder-pro/xr.jpg)

### AI 眼镜与 Always-on Agent

AI 眼镜和持续运行的智能体需要长期观察环境、理解用户行为。低成本、可移动的手机数据采集方案可以先用于原型验证和数据闭环。

例如将手机固定在胸前，通过间歇式、占空比约 10% 的采集策略，连续记录低功耗音频和 GPS，并在固定间隔唤醒相机录制短视频，可以模拟 Always-on 硬件的数据形态，用于探索 Life-Long Agent 系统。

![Always-on Agent 数据采集示例](/media/notes/phone-as-sensor-recorder-pro/always-on-agent.jpg)

### 科学实验与教育

手机传感器适合用于物理实验、运动研究和课堂演示。统一导出的数据文件也方便复现实验过程、共享数据和比较结果。

## Sensor Recorder Pro 是什么？

Sensor Recorder Pro 是一个面向算法和实验的数据采集工具，当前以 iPhone 为主要平台。它可以同步记录多种传感器数据，并将一次记录导出成结构清晰、便于复用的文件。

核心能力包括：

- **多相机视频**：支持两路后置相机，可配置相机、分辨率、帧率、最大曝光、自动或固定对焦，适合 VIO、SLAM 和运动分析。
- **音频采集**：记录与其他传感器对应的音频数据。
- **IMU 数据**：记录加速度计和陀螺仪数据。
- **Device Motion**：记录设备姿态、旋转、重力和用户加速度等数据。
- **GNSS / 地理位置**：记录位置、速度、航向和精度等轨迹信息。
- **多源时间戳**：同时提供单调递增的机器时间和 UTC 时间，便于跨传感器对齐。
- **开放源代码**：项目源码已公开，方便研究和二次开发。

产品的核心目标，是让真实世界的多模态传感器数据更容易采集、导出和使用。

![Rerun 可视化](/media/notes/phone-as-sensor-recorder-pro/rerun-visualization.jpg)

## 数据格式与使用方式

每次记录会保存为一个独立的 session 文件夹，包含通用媒体文件和 CSV 数据文件：

```text
SR_yyyy-MM-dd_HH-mm-ss/
├── meta.json
├── wide.mp4
├── wide_info.csv
├── ultrawide.mp4
├── ultra_info.csv
├── audio.m4a
├── audio_info.csv
├── accelerometer.csv
├── gyroscope.csv
├── imu.csv
├── device_motion.csv
├── magnetometer.csv
├── barometer.csv
└── geo_location.csv
```

主要字段如下：

- `wide_info.csv` / `ultra_info.csv`：包含 `sensor_sec`、`utc_sec`、曝光、ISO、分辨率和相机内参等信息。
- `audio_info.csv`：包含 `sensor_sec`、`utc_sec`、时长、采样率和声道数。
- `accelerometer.csv`：包含 `sensor_sec`、`utc_sec`、`ax`、`ay`、`az`。
- `gyroscope.csv`：包含 `sensor_sec`、`utc_sec`、`gx`、`gy`、`gz`。
- `imu.csv`：包含对齐后的陀螺仪、加速度计和时间戳。
- `device_motion.csv`：包含四元数、roll / pitch / yaw、重力和用户加速度。
- `magnetometer.csv`：包含 `sensor_sec`、`utc_sec`、`mx`、`my`、`mz`。
- `barometer.csv`：包含时间戳、气压和相对高度。
- `geo_location.csv`：包含时间戳、纬度、经度、高度、速度、航向和定位精度。

## 开放数据

我也在使用自己的手机采集数据。如果这些数据对你的研究或实验有帮助，欢迎下载、分析和提出问题，也欢迎基于它做一些有趣的尝试。

示例数据：[inv0](https://pan.baidu.com/s/1AkZOUvUq2zS3ihPHkEMs9g)

Sensor Recorder Pro 可在 [App Store](https://apps.apple.com/us/app/sensor-recorder-pro/id6782758613?l=zh-Hans-CN) 获取，项目源码见 [GitHub](https://github.com/ydsf16/ios_sensor_recorder)。

## 后续计划

- 增加更多传感器支持，例如前置相机、LiDAR 和更多后置相机。
- 完善离线处理工具链，例如将分散的数据文件打包为 `.mcap` 或 `.rrd`。
- 继续探索基础模型训练、终身智能、具身智能、机器人和 XR 等方向的应用。

## 总结

手机可以成为进入物理世界的一种低成本、分布式入口。先把稳定、可复现的数据采集做好，再让 AI 更好地理解物理世界。

欢迎体验、拍砖、Star！
