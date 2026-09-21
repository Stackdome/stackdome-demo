# Mirrored needs a real browser, Node and Pillow. The WalkThroughPark image already has all
# three and is already in the registry, so this image only adds Mirrored's own tools.
FROM akshaysasidrn/walkthroughpark-sandbox@sha256:dd6905ad87d6b8f4d91c5bd52512887eb4b51896639cc993016e4febcc93a200

# Dembrandt (MIT) measures a whole site's design system. It wants its own Chromium revision, and
# Playwright's installer deletes revisions it does not know, so its browser lives in its own folder
# and is fetched here, never at run time.
# The npm cache is dropped in the same step, or it would stay in the layer (it was close to 1 GB).
RUN npm install --global dembrandt@0.35.0 --no-audit --no-fund \
    && PLAYWRIGHT_BROWSERS_PATH=/opt/dembrandt-browsers dembrandt install-browser \
    && npm cache clean --force && rm -rf /root/.npm /tmp/* \
    # Not needed here, and together they were 900 MB: the ML runtime behind its experimental --ai flag,
    # and the headed Chromium (Dembrandt runs the headless shell).
    && rm -rf "$(npm root -g)/dembrandt/node_modules/onnxruntime-node" /opt/dembrandt-browsers/chromium-[0-9]* \
    && PLAYWRIGHT_BROWSERS_PATH=/opt/dembrandt-browsers timeout 120 dembrandt example.com --no-sandbox --json-only > /dev/null

# Layers below change often; the heavy browser layer above stays cached and is not pushed again.
# React, Tailwind and tsx, so a rebuilt component is rendered for real before it is scored.
COPY harness/package.json /opt/mirrored/harness/package.json
RUN cd /opt/mirrored/harness && npm install --no-audit --no-fund && npm cache clean --force && rm -rf /root/.npm
COPY harness/ssr.mjs /opt/mirrored/harness/ssr.mjs
COPY text-rects.mjs /opt/mirrored/text-rects.mjs

COPY mir-brand /usr/local/bin/mir-brand
COPY mir-measure.mjs /usr/local/bin/mir-measure
COPY mir-reflect.mjs /usr/local/bin/mir-reflect
COPY mir-pack.py /usr/local/bin/mir-pack
COPY mir-diff.py /usr/local/bin/mir-diff.py
COPY MIRRORED.md /opt/mirrored/MIRRORED.md
RUN chmod +x /usr/local/bin/mir-brand /usr/local/bin/mir-measure /usr/local/bin/mir-reflect /usr/local/bin/mir-pack /usr/local/bin/mir-diff.py \
    && test "$(opencode --version)" = "1.18.29" \
    && python3 -c "import PIL" \
    && dembrandt --version
