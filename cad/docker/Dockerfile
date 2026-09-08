FROM scratch
COPY rootfs/ /
ENV PATH=/opt/venv/bin:/usr/bin LANG=C.UTF-8 LC_ALL=C.UTF-8 \
    PYTHONDONTWRITEBYTECODE=1 CRAFTY_CONTAINER=1 \
    OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1
WORKDIR /opt/cad
USER 0:0
ENTRYPOINT ["/opt/venv/bin/python", "-m", "crafty_cad.container"]
