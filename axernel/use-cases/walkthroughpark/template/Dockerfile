# Axernel sandbox template for WalkThroughPark.
# Axernel's runtime needs: linux/amd64, coreutils, root, and `opencode` on PATH
# reporting exactly the pinned version. The agent-runtime binary is uploaded per run.
FROM mcr.microsoft.com/playwright:v1.61.1-noble

ARG OPENCODE_VERSION=1.18.29

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates curl ffmpeg fonts-dejavu-core gh git jq procps python3 python3-pil unzip \
    && rm -rf /var/lib/apt/lists/*

RUN npm install --global opencode-ai@${OPENCODE_VERSION} \
    && test "$(opencode --version)" = "${OPENCODE_VERSION}"

WORKDIR /opt/walkthrough
COPY walkthrough/package.json ./
RUN npm install --no-audit --no-fund
COPY walkthrough/ ./

# bake the Kokoro weights into the image and prove the voice works on this libc
RUN node --input-type=module -e "const {KokoroTTS}=await import('kokoro-js');const t=await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX',{dtype:'q8',device:'cpu'});const a=await t.generate('Ready.',{voice:'af_heart'});if(!a.audio.length)process.exit(1);console.log('kokoro ok',a.audio.length)"

COPY wtp-render /usr/local/bin/wtp-render
RUN chmod +x /usr/local/bin/wtp-render && mkdir -p /workspace

WORKDIR /workspace
