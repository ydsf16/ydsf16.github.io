---
type: note
title: "[Phone AI] Turning an iPhone into a Data Recorder"
lang: en
date: 2026-07-02
updated: 2026-07-02
status: "published"
featured: false
priority: -1
tags: [data collection, SLAM, embodied AI, IMU, GNSS]
categories: [Phone AI, Technical Notes]
draft: false
source:
  platform: Zhihu
  type: article
  url: https://zhuanlan.zhihu.com/p/2056025596623431002
relatedProducts: [sensor-recorder-pro]
relatedProjects: [robotics-experiments]
---

I recently built an iPhone multi-sensor recording tool: **Sensor Recorder Pro**. The goal is to turn a phone into an affordable recorder for real-world data.

It currently supports iPhone (iOS) and can synchronously capture two camera streams, audio, IMU, device motion, GNSS, and other sources, then export them as well-structured data files.

This article covers three questions:

- Why is a phone worth treating as a data-capture platform?
- Why do embodied AI, Physical AI, robotics, XR, and scientific experiments need multi-sensor data?
- What does Sensor Recorder Pro do today, and where might it go next?

![Sensor Recorder Pro](/media/notes/phone-as-sensor-recorder-pro/overview.png)

App: [Sensor Recorder Pro](https://apps.apple.com/us/app/sensor-recorder-pro/id6782758613?l=zh-Hans-CN)  
Open-source code: [ydsf16/ios_sensor_recorder](https://github.com/ydsf16/ios_sensor_recorder)

## Phones: an underrated gateway to real-world data

A phone is already a highly integrated multi-sensor computing platform. It commonly includes cameras, microphones, an IMU, GNSS, a magnetometer, and a barometer; some higher-end devices also provide LiDAR or depth data. It also brings edge compute, mature permission controls, storage, and networking.

That lets us use equipment already in hand to collect real-world data, reduce the cost of developing and maintaining dedicated hardware, and make more low-cost experiments practical.

Compared with designing, manufacturing, and debugging a dedicated data logger from scratch, a phone can be deployed quickly with a low barrier to entry. Its sensors and on-device compute continue to improve, too. For many real-world data-collection tasks, we do not need custom hardware before running the first experimental loop: existing phone sensors and compute are often enough to get started economically.

Sensor Recorder Pro is a first step based on this idea. Beginning with iPhone, it aims to make the phone an out-of-the-box multi-sensor recorder with exportable data and reproducible experiments.

## Why multi-sensor data?

Progress in foundation models depends on both data scale and data form. Embodied AI, Physical AI, robotics, and XR systems operate in a continuously changing physical world, where a single modality rarely describes a scene completely. Video, audio, location, motion state, and inertial data need to be recorded together on a shared timeline to support perception, localization, mapping, control, and training.

### Embodied AI and Physical AI

Embodied intelligence needs continuous visual, action, and state information from the physical environment. A phone can serve as a lightweight collection endpoint, providing real samples for action understanding, environmental perception, and multimodal models.

For egocentric AI datasets, researchers often mount a phone on the neck or head to record daily human activity, then clean the data and train foundational physical-world models in the cloud. Sensor Recorder Pro is intended to make one part of that pipeline easier: capturing raw multi-sensor data conveniently as the basis for later algorithms.

![AoE: Always-on Egocentric Human Video Collection for Embodied AI](/media/notes/phone-as-sensor-recorder-pro/aoe.jpg)

### Robotics

Robotic systems depend on the timing relationship between visual, inertial, positional, and motion data. High-quality synchronized recordings can support VIO, SLAM, motion analysis, sensor calibration, and algorithm validation.

A phone can also be rigidly mounted to a low-cost mobile robot—such as a quadruped, wheeled base, or drone—to serve as both a sensor source and a temporary compute platform while rapidly validating a prototype.

![Robot data-collection example](/media/notes/phone-as-sensor-recorder-pro/robot.jpg)

### XR / AR / VR

XR devices need to understand both the user's head and body movement and the surrounding space. Cameras, IMU, device motion, and GNSS can support research into spatial localization, pose estimation, and interaction.

Sensor Recorder Pro currently focuses on recording low-level raw data. Compared with the outputs of highly encapsulated spatial frameworks, raw recordings are better suited to validating custom spatial-computing, reconstruction, and sensor-fusion methods.

![XR / AR / VR data-collection example](/media/notes/phone-as-sensor-recorder-pro/xr.jpg)

### AI glasses and always-on agents

AI glasses and persistent agents need to observe their surroundings and understand user behavior over long periods. A low-cost, mobile phone-based collection setup can first be used for prototype validation and to close the data loop.

For example, a phone can be attached to the chest and use an intermittent, roughly 10% duty-cycle strategy: record low-power audio and GPS continuously, wake the camera at set intervals for short clips, and approximate the data pattern of always-on hardware for exploring lifelong-agent systems.

![Always-on agent data-collection example](/media/notes/phone-as-sensor-recorder-pro/always-on-agent.jpg)

### Scientific experiments and education

Phone sensors are well suited to physics experiments, motion studies, and classroom demonstrations. A unified export format also makes it easier to reproduce an experiment, share recordings, and compare results.

## What is Sensor Recorder Pro?

Sensor Recorder Pro is a data-collection tool for algorithms and experiments, with iPhone as its primary platform today. It synchronously records several sensor sources and exports each recording as a clearly structured, reusable set of files.

Its core capabilities include:

- **Multi-camera video**: supports two rear cameras, with configurable camera selection, resolution, frame rate, maximum exposure, and automatic or fixed focus for VIO, SLAM, and motion analysis.
- **Audio capture**: records audio aligned with the other sensor streams.
- **IMU data**: records accelerometer and gyroscope measurements.
- **Device Motion**: records device attitude, rotation, gravity, and user acceleration.
- **GNSS / geolocation**: records trajectories including position, speed, course, and accuracy.
- **Multiple time bases**: provides both monotonic machine time and UTC time for cross-sensor alignment.
- **Open source**: source code is public for research and further development.

The product's central goal is to make real-world multimodal sensor data easier to collect, export, and use.

![Rerun visualization](/media/notes/phone-as-sensor-recorder-pro/rerun-visualization.jpg)

## Data format and workflow

Each recording is saved as its own session folder, containing standard media and CSV files:

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

The main files contain:

- `wide_info.csv` / `ultra_info.csv`: `sensor_sec`, `utc_sec`, exposure, ISO, resolution, camera intrinsics, and related metadata.
- `audio_info.csv`: `sensor_sec`, `utc_sec`, duration, sample rate, and channel count.
- `accelerometer.csv`: `sensor_sec`, `utc_sec`, `ax`, `ay`, and `az`.
- `gyroscope.csv`: `sensor_sec`, `utc_sec`, `gx`, `gy`, and `gz`.
- `imu.csv`: aligned gyroscope, accelerometer, and timestamp data.
- `device_motion.csv`: quaternions, roll / pitch / yaw, gravity, and user acceleration.
- `magnetometer.csv`: `sensor_sec`, `utc_sec`, `mx`, `my`, and `mz`.
- `barometer.csv`: timestamps, pressure, and relative altitude.
- `geo_location.csv`: timestamps, latitude, longitude, altitude, speed, course, and location accuracy.

## Open data

I also collect data with my own phone. If it helps your research or experiment, you are welcome to download it, analyze it, ask questions, or build something interesting with it.

Sample data: [inv0](https://pan.baidu.com/s/1AkZOUvUq2zS3ihPHkEMs9g)

Sensor Recorder Pro is available on the [App Store](https://apps.apple.com/us/app/sensor-recorder-pro/id6782758613?l=zh-Hans-CN), and its source is on [GitHub](https://github.com/ydsf16/ios_sensor_recorder).

## Next steps

- Add support for more sensors, including the front camera, LiDAR, and additional rear cameras.
- Improve offline tools, for example by packaging separate recordings as `.mcap` or `.rrd` files.
- Continue exploring applications in foundation-model training, lifelong intelligence, embodied AI, robotics, and XR.

## Closing thoughts

A phone can be an affordable, distributed entry point into the physical world. First make data collection stable and reproducible; then give AI a better foundation for understanding that world.

Feedback, experiments, and GitHub stars are welcome.
