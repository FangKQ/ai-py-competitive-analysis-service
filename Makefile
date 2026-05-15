.PHONY: help install dev build deploy test clean

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

install: ## Install all dependencies
	cd backend && pip install -r requirements.txt
	cd frontend && npm install

dev-backend: ## Start backend dev server
	cd backend && uvicorn main:app --reload --port 8000

dev-frontend: ## Start frontend dev server
	cd frontend && npm run dev

dev: ## Start both dev servers (use tmux or 2 terminals)
	@echo "Run in separate terminals:"
	@echo "  make dev-backend"
	@echo "  make dev-frontend"

build: ## Build Docker images
	docker compose build

deploy: ## Deploy with Docker Compose
	docker compose up -d

deploy-stop: ## Stop deployment
	docker compose down

logs: ## Show Docker logs
	docker compose logs -f

test: ## Run tests
	cd backend && python -m pytest tests/ -v

lint: ## Run linters
	cd backend && python -m ruff check .
	cd frontend && npm run lint

report: ## Build LaTeX report PDF
	cd docs/report && tectonic main.tex

clean: ## Clean build artifacts
	find . -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name .next -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name node_modules -exec rm -rf {} + 2>/dev/null || true
