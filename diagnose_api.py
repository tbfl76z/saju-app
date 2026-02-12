import google.generativeai as genai
import os

def diagnose():
    api_key = "AIzaSyDw8fwnoZzpxIDPevAbvt-YYses9VMQ93Q"
    genai.configure(api_key=api_key)
    
    print("--- Available Models ---")
    try:
        for m in genai.list_models():
            print(f"Name: {m.name}")
            print(f"  Methods: {m.supported_generation_methods}")
            print(f"  Description: {m.description}")
            print("-" * 20)
    except Exception as e:
        print(f"Error listing models: {e}")

if __name__ == "__main__":
    diagnose()
