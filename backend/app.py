from flask import Flask
from flask_cors import CORS
from routes.loading_routes import loading_bp

app = Flask(__name__)
CORS(app)

# 注册蓝图
app.register_blueprint(loading_bp, url_prefix='/api')

if __name__ == '__main__':
    app.run(debug=True) 