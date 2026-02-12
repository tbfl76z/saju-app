import google.generativeai as genai
import os

def check_all_models():
    # 사용자 제공 API 키 사용
    api_key = "AIzaSyDw8fwnoZzpxIDPevAbvt-YYses9VMQ93Q"
    genai.configure(api_key=api_key)
    
    executable_models = []
    try:
        for m in genai.list_models():
            if 'generateContent' in m.supported_generation_methods:
                executable_models.append(m.name)
        
        with open("confirmed_models.txt", "w", encoding="utf-8") as f:
            if executable_models:
                f.write("\n".join(executable_models))
                print(f"FOUND: {len(executable_models)} models")
            else:
                f.write("NO_GENERATIVE_MODELS_FOUND")
                print("NONE")
    except Exception as e:
        print(f"ERROR: {e}")

if __name__ == "__main__":
    check_all_models()
