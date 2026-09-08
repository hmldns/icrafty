.DEFAULT_GOAL := all
.DELETE_ON_ERROR:

PLANTUML ?= plantuml
SOURCES := $(sort $(wildcard *.puml))
SVG := $(patsubst %.puml,rendered/%.svg,$(SOURCES))
PNG := $(patsubst %.puml,rendered/%.png,$(SOURCES))

.PHONY: all svg png check clean

all: svg png

svg: $(SVG)

png: $(PNG)

rendered:
	mkdir -p "$@"

rendered/%.svg: %.puml theme.iuml Makefile | rendered
	$(PLANTUML) --check-before-run --no-error-image --format svg --output-dir rendered "$<"

rendered/%.png: %.puml theme.iuml Makefile | rendered
	$(PLANTUML) --check-before-run --no-error-image --format png --output-dir rendered "$<"

check:
	$(PLANTUML) --check-syntax $(SOURCES)

clean:
	rm -f $(SVG) $(PNG)
