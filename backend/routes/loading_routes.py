from flask import Blueprint, request, jsonify
from werkzeug.utils import secure_filename
import os
from services.loading_service import LoadingService
import json

loading_bp = Blueprint('loading', __name__)
loading_service = LoadingService()

@loading_bp.route('/supported-extensions', methods=['GET'])
def get_supported_extensions():
    """
    获取支持的文件扩展名和对应的加载方法。
    """
    return jsonify(loading_service.get_supported_extensions())

@loading_bp.route('/load', methods=['POST'])
def load_file():
    """
    加载文件并返回处理后的内容。
    """
    if 'file' not in request.files:
        return jsonify({'error': '没有文件'}), 400
        
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': '没有选择文件'}), 400
        
    loading_method = request.form.get('loading_method')
    if not loading_method:
        return jsonify({'error': '没有指定加载方法'}), 400
        
    # 获取其他可选参数
    strategy = request.form.get('strategy')
    chunking_strategy = request.form.get('chunking_strategy')
    chunking_options = request.form.get('chunking_options')
    
    if chunking_options:
        try:
            chunking_options = json.loads(chunking_options)
        except json.JSONDecodeError:
            return jsonify({'error': '无效的分块选项'}), 400
    
    try:
        # 保存上传的文件
        filename = secure_filename(file.filename)
        filepath = os.path.join('uploads', filename)
        os.makedirs('uploads', exist_ok=True)
        file.save(filepath)
        
        # 加载文件
        content = loading_service.load_file(
            filepath,
            loading_method,
            strategy=strategy,
            chunking_strategy=chunking_strategy,
            chunking_options=chunking_options
        )
        
        # 保存处理后的文档
        saved_path = loading_service.save_document(
            filename,
            loading_service.current_page_map,
            {
                'total_pages': loading_service.total_pages,
                'loading_method': loading_method,
                'strategy': strategy,
                'chunking_strategy': chunking_strategy
            },
            loading_method,
            strategy,
            chunking_strategy
        )
        
        return jsonify({
            'loaded_content': {
                'content': content,
                'total_pages': loading_service.total_pages,
                'loading_method': loading_method,
                'strategy': strategy,
                'chunking_strategy': chunking_strategy,
                'saved_path': saved_path
            }
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500
    finally:
        # 清理上传的文件
        if os.path.exists(filepath):
            os.remove(filepath) 