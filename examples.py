import sys

try:
    # Force Chroma to use pysqlite3 instead of the default sqlite3
    __import__('pysqlite3')
    sys.modules['sqlite3'] = sys.modules.pop('pysqlite3')
except ImportError:
    pass


import os
# from dotenv import load_dotenv
import streamlit as st
import asyncio # <--- 1. Import asyncio

from langchain_core.example_selectors import BaseExampleSelector

# load_dotenv()

examples = [
    {
        "input": "List all customers in France with a credit limit over 20,000.",
        "query": "SELECT * FROM customers WHERE country = 'France' AND creditLimit > 20000;"
    },
    {
        "input": "Get the highest payment amount made by any customer.",
        "query": "SELECT MAX(amount) FROM payments;"
    },
    {
        "input": "Show product details for products in the 'Motorcycles' product line.",
        "query": "SELECT * FROM products WHERE productLine = 'Motorcycles';"
    },
    {
        "input": "Retrieve the names of employees who report to employee number 1002.",
        "query": "SELECT firstName, lastName FROM employees WHERE reportsTo = 1002;"
    },
    {
        "input": "List all products with a stock quantity less than 7000.",
        "query": "SELECT productName, quantityInStock FROM products WHERE quantityInStock < 7000;"
    },
    {
     'input':"what is price of `1968 Ford Mustang`",
     "query": "SELECT `buyPrice`, `MSRP` FROM products  WHERE `productName` = '1968 Ford Mustang' LIMIT 1;"
    }
]

class StaticExampleSelector(BaseExampleSelector):
    """Select examples without requiring a second model provider for embeddings."""

    def add_example(self, example):
        examples.append(example)
        return len(examples) - 1

    def select_examples(self, input_variables):
        return examples[:2]


@st.cache_resource
def get_example_selector():
    return StaticExampleSelector()
