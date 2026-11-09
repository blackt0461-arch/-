# models/ の出典

- `efficientdet_lite0.tflite`：人を見つける学習ずみモデル。Google MediaPipe の Object Detector（EfficientDet-Lite0, float16）。
  - 取得元：https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.tflite
  - 使用条件：Apache License 2.0（https://ai.google.dev/edge/mediapipe/solutions/vision/object_detector）
- 読みこむ部品 `@mediapipe/tasks-vision`（Apache License 2.0）は jsDelivr から読む（sw.js が端末に保存するので、2回目からは電波なしでも動く）。
