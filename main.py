import os

import streamlit as st

api_key = os.getenv("GROQ_API_KEY")

if not api_key:
    st.error("ERROR: GROQ_API_KEY not found!")
    st.info("Please make sure your environment contains GROQ_API_KEY='your_api_key'")
    st.stop()

from langchain_utils import invoke_chain

st.title("Langchain NL2SQL Chatbot")

if "messages" not in st.session_state:
    st.session_state.messages = []

for message in st.session_state.messages:
    with st.chat_message(message["role"]):
        st.markdown(message["content"])

if prompt := st.chat_input("What is up?"):
    st.session_state.messages.append({"role": "user", "content": prompt})
    with st.chat_message("user"):
        st.markdown(prompt)

    with st.spinner("Generating response..."):
        with st.chat_message("assistant"):
            response = invoke_chain(prompt, st.session_state.messages)
            st.markdown(response)
    st.session_state.messages.append({"role": "assistant", "content": response})
