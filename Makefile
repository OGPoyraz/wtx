.PHONY: build install uninstall clean

PREFIX ?= /usr/local

build:
	bun build src/index.ts --compile --outfile dist/wtx

install: build
	install -m 755 dist/wtx $(PREFIX)/bin/wtx

uninstall:
	rm -f $(PREFIX)/bin/wtx

clean:
	rm -rf dist/
