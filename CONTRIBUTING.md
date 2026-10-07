# Contributing to MusicTalk 🎵

Thank you for your interest in contributing to MusicTalk! We welcome contributions to improve the AI recognition models, frontend user experience, microservices, and documentation.

## Development Workflow

1. **Fork & Clone**
   ```bash
   git clone https://github.com/your-username/MusicTalk.git
   cd MusicTalk
   ```

2. **Branching Strategy**
   Create a feature or bugfix branch with a descriptive name:
   ```bash
   git checkout -b feature/new-instrument-detector
   ```

3. **Install Dependencies**
   - Python: `pip install -r requirements.txt`
   - Frontend: `cd frontend && npm install`

4. **Running Locally**
   - Use `./start_all.bat` (Windows) or `./start_all.sh` (Linux/macOS) to start all microservices and frontend.
   - Or use Docker: `docker-compose up --build`

5. **Commit Conventions**
   - `feat:` New features (e.g. `feat(recognition): add drum detector model`)
   - `fix:` Bug fixes (e.g. `fix(gateway): resolve CORS header collision`)
   - `docs:` Documentation improvements
   - `refactor:` Code refactoring without behavioral change
   - `test:` Adding or updating tests

6. **Submitting a Pull Request**
   - Push your branch to GitHub.
   - Open a Pull Request against the `main` branch.
   - Describe what changed and include screenshots or audio test results if applicable.

---
Happy coding! 🚀
