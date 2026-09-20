# Mirrored needs a real browser, Node and Pillow. The WalkThroughPark image already has all
# three and is already in the registry, so this image only adds Mirrored's own tools.
FROM akshaysasidrn/walkthroughpark-sandbox@sha256:dd6905ad87d6b8f4d91c5bd52512887eb4b51896639cc993016e4febcc93a200

# React, Tailwind and tsx, so a rebuilt component is rendered for real before it is scored.
COPY harness/package.json /opt/mirrored/harness/package.json
RUN cd /opt/mirrored/harness && npm install --no-audit --no-fund
COPY harness/ssr.mjs /opt/mirrored/harness/ssr.mjs

COPY mir-measure.mjs /usr/local/bin/mir-measure
COPY mir-reflect.mjs /usr/local/bin/mir-reflect
COPY mir-pack.py /usr/local/bin/mir-pack
COPY mir-diff.py /usr/local/bin/mir-diff.py
COPY MIRRORED.md /opt/mirrored/MIRRORED.md
RUN chmod +x /usr/local/bin/mir-measure /usr/local/bin/mir-reflect /usr/local/bin/mir-pack /usr/local/bin/mir-diff.py \
    && test "$(opencode --version)" = "1.18.29" \
    && python3 -c "import PIL"
