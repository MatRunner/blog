# cpu端侧推理性能分析

## 测试环境

推理框架使用llama.cpp, 模型为llama-3.1-instruct-q4_k_m.gguf

对比环境为kp920和AMD9654

## 热点分析

### prefill 阶段

测试命令如下：
```bash
llama-bench -m llama-3.1-instruct-q4_k_m.gguf -p 128 -n 1 -t 1
```
该阶段热点为ggml_gemm_q4_K_8x8_q8_K，占比约70%。
