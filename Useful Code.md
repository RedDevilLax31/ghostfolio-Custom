## Restart Docker

systemctl --user restart docker-desktop

## Dev Setup

Run - npm install
Run - docker compose -f docker/docker-compose.dev.yml up -d
Run - npm run database:setup

Start Server - npm run start:server
Start Client - npm run start:client
Open https://localhost:4200/en in your browser

## Failed Automatic Github upstream merge

git status - ensure everying is clean and commited
git checkout main - ensure working from main branch
git merge upstream/main - pulls in upstream commits and shows merge conflicts
