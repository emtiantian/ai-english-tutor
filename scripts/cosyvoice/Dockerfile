# CosyVoice 官方 runtime/python/Dockerfile（本仓库内副本）
#
# 来源：FunAudioLLM/CosyVoice runtime/python/Dockerfile（main 分支）
# 在仓库内放副本的原因：CosyVoice 官方未发布 Docker 镜像、仅提供 Dockerfile，
# docker-compose.cosyvoice.yml 的 build 块需要一个本地 context（极小，仅本文件），
# 避免依赖 buildkit 拉 git context（国内代理不可靠）。上游绑定 pytorch 2.0.1 + cuda11.7，
# 不常变，定期同步上游即可。
#
# 代理机制：
#   构建时由 docker-compose.cosyvoice.yml 的 build.args 注入 HTTP_PROXY/HTTPS_PROXY，
#   配合 build.network: host，容器内 127.0.0.1:7890 即宿主机代理。
#   - apt 已切阿里云源、pip 用阿里云镜像，本身无需代理
#   - 仅 `git clone --recursive GitHub` 需要代理（HTTP_PROXY 环境变量对 git 生效）
#   - FROM 拉取 pytorch 基础镜像由 docker daemon 处理，需服务器配镜像加速或 daemon 代理
#
# 容器内关键路径（与 compose 挂载 / wrapper 对齐）：
#   /opt/CosyVoice/CosyVoice                            <- git clone 目标（代码根）
#   /opt/CosyVoice/CosyVoice/pretrained_models          <- 预置模型（compose bind mount）
#   /opt/CosyVoice/CosyVoice/runtime/python/fastapi/server.py <- 官方 FastAPI 入口

FROM pytorch/pytorch:2.0.1-cuda11.7-cudnn8-runtime
ENV DEBIAN_FRONTEND=noninteractive

WORKDIR /opt/CosyVoice

RUN sed -i s@/archive.ubuntu.com/@/mirrors.aliyun.com/@g /etc/apt/sources.list
RUN apt-get update -y
RUN apt-get -y install git unzip git-lfs g++
RUN git lfs install
RUN git clone --recursive https://github.com/FunAudioLLM/CosyVoice.git
# here we use python==3.10 because we cannot find an image which have both python3.8 and torch2.0.1-cu118 installed
# openai-whisper 的 setup.py 直接 import pkg_resources，且未声明 build-system requires，
# 在 pip 构建隔离环境中会报 ModuleNotFoundError；先装含 pkg_resources 的 setuptools + wheel，
# 再对 openai-whisper 单独使用 --no-build-isolation。
RUN pip3 install --upgrade pip -i https://mirrors.aliyun.com/pypi/simple/ --trusted-host=mirrors.aliyun.com --no-cache-dir
RUN pip3 install "setuptools<70" wheel -i https://mirrors.aliyun.com/pypi/simple/ --trusted-host=mirrors.aliyun.com --no-cache-dir
RUN cd CosyVoice && grep -v '^openai-whisper' requirements.txt > /tmp/requirements_no_whisper.txt && \
    pip3 install -r /tmp/requirements_no_whisper.txt -i https://mirrors.aliyun.com/pypi/simple/ --trusted-host=mirrors.aliyun.com --no-cache-dir && \
    pip3 install --no-build-isolation "openai-whisper==20231117" -i https://mirrors.aliyun.com/pypi/simple/ --trusted-host=mirrors.aliyun.com --no-cache-dir
RUN cd CosyVoice/runtime/python/grpc && python3 -m grpc_tools.protoc -I. --python_out=. --grpc_python_out=. cosyvoice.proto
