.PHONY: build dev clean install

# Build single deployable HTML file -> dist/index.html
build:
	npm run build
	cp dist/index.html docs/

# Dev server with hot reload (http://localhost:5173)
# 5173 is Vite's hardcoded default port
dev:
	npm run dev

# One-time setup.
# npm will read package.json and download Vite and vite-plugin-singlefile into a local node_modules/ directory.
install:
	npm install

clean:
	rm -rf dist
