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
# 先升级 setuptools/pip，避免部分依赖的 setup.py 报 ModuleNotFoundError: No module named 'pkg_resources'
RUN pip3 install --upgrade setuptools pip -i https://mirrors.aliyun.com/pypi/simple/ --trusted-host=mirrors.aliyun.com --no-cache-dir
RUN cd CosyVoice && pip3 install -r requirements.txt -i https://mirrors.aliyun.com/pypi/simple/ --trusted-host=mirrors.aliyun.com --no-cache-dir
RUN cd CosyVoice/runtime/python/grpc && python3 -m grpc_tools.protoc -I. --python_out=. --grpc_python_out=. cosyvoice.proto
