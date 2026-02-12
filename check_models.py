import google.generativeai as genai
import os

def check_models():
    api_key = os.environ.get("GOOGLE_API_KEY")
    if not api_key:
        print("API_KEY_MISSING")
        return
    
    genai.configure(api_key=api_key)
    try:
        with open("supported_models.txt", "w", encoding="utf-8") as f:
            for m in genai.list_models():
                if 'createCachedContent' in m.supported_generation_methods:
                    f.write(f"{m.name}\n")
        print("DONE")
    except Exception as e:
        with open("supported_models.txt", "w", encoding="utf-8") as f:
            f.write(f"ERROR: {str(e)}")
        print("FAILED")

if __name__ == "__main__":
    check_models()
