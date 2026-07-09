#!/usr/bin/env python3
"""Rebuild eu_pruner from source and assert byte-identity to the golden. Usage: check_task.py"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import importlib.util
spec = importlib.util.spec_from_file_location("g", os.path.join(os.path.dirname(__file__), "cpp-goldens.py"))
g = importlib.util.module_from_spec(spec); spec.loader.exec_module(g)
os.makedirs(g.WORK, exist_ok=True)
# corpus + golden must already exist (run cpp-goldens.py first if /tmp/cpp-goldens-work is gone)
pruner = g.build("eu_pruner_new", "eu_pruner.cpp")
g.assert_byte_identical(pruner, "compact pruner")
