 import os
  import ast
  from typing import List

  def scan_repository(path: str) -> List[str]:
      """
      Recursively scan the repository and detect Python (.py) and JavaScript (.js/.ts) files.

      Args:
          path (str): The path to the repository.

      Returns:
          List[str]: A list of file paths.
      """
      file_paths = []
      ignore_dirs = {'.git', 'node_modules', '__pycache__'}

      for root, dirs, files in os.walk(path):
          dirs[:] = [d for d in dirs if d not in ignore_dirs]
          for file in files:
              if file.endswith('.py') or file.endswith('.js') or file.endswith('.ts'):
                  file_paths.append(os.path.join(root, file))

      return file_paths

  def extract_imports(file_path: str) -> List[str]:
      """
      Extract all import statements from a Python file.

      Args:
          file_path (str): The path to the Python file.

      Returns:
          List[str]: A list of imported modules.
      """
      with open(file_path, 'r') as file:
          tree = ast.parse(file.read())

      imports = []
      for node in ast.walk(tree):
          if isinstance(node, ast.Import):
              for alias in node.names:
                  imports.append(alias.name)
          elif isinstance(node, ast.ImportFrom):
              imports.append(node.module)

      return imports