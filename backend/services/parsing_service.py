import logging
from typing import Dict, List
import fitz  # PyMuPDF
import pandas as pd
from datetime import datetime
import json
from unstructured.partition.pdf import partition_pdf
from unstructured.partition.md import partition_md
from unstructured.partition.image import partition_image
import pytesseract
from PIL import Image
import io
import base64

logger = logging.getLogger(__name__)

class ParsingService:
    """
    PDF文档解析服务类
    
    该类提供多种解析策略来提取和构建PDF文档内容，包括：
    - 全文提取
    - 逐页解析
    - 基于标题的分段
    - 文本和表格混合解析
    - 图片OCR解析
    """

    def parse_pdf(self, text: str, method: str, metadata: dict, page_map: list = None) -> dict:
        """
        使用指定方法解析PDF文档

        参数:
            text (str): PDF文档的文本内容
            method (str): 解析方法 ('all_text', 'by_pages', 'by_titles', 或 'text_and_tables')
            metadata (dict): 文档元数据，包括文件名和其他属性
            page_map (list): 包含每页内容和元数据的字典列表

        返回:
            dict: 解析后的文档数据，包括元数据和结构化内容

        异常:
            ValueError: 当page_map为空或指定了不支持的解析方法时抛出
        """
        try:
            if not page_map:
                raise ValueError("Page map is required for parsing.")
            
            parsed_content = []
            total_pages = len(page_map)
            
            if method == "all_text":
                parsed_content = self._parse_all_text(page_map)
            elif method == "by_pages":
                parsed_content = self._parse_by_pages(page_map)
            elif method == "by_titles":
                parsed_content = self._parse_by_titles(page_map)
            elif method == "text_and_tables":
                parsed_content = self._parse_text_and_tables(page_map)
            else:
                raise ValueError(f"Unsupported parsing method: {method}")
                
            # 创建标准化的文档数据结构
            document_data = {
                "filename": metadata.get("filename", ""),
                "total_pages": total_pages,
                "total_chunks": len(parsed_content),
                "loading_method": metadata.get("loading_method", ""),
                "chunking_method": method,
                "timestamp": datetime.now().isoformat(),
                "chunks": [
                    {
                        "content": item.get("content", ""),
                        "metadata": {
                            "chunk_id": idx + 1,
                            "page_number": item.get("page", 1),
                            "page_range": f"Page {item.get('page', 1)}",
                            "word_count": len(item.get("content", "").split()),
                            "char_count": len(item.get("content", "")),
                            "chunk_type": item.get("type", "text"),
                            **item.get("metadata", {})
                        }
                    }
                    for idx, item in enumerate(parsed_content)
                ]
            }
            
            return document_data
            
        except Exception as e:
            logger.error(f"Error in parse_pdf: {str(e)}")
            raise

    def _parse_all_text(self, page_map: list) -> list:
        """
        将文档中的所有文本内容提取为连续流，包括表格和图片内容
        """
        parsed_content = []
        for page in page_map:
            # 处理文本内容
            if "text" in page:
                parsed_content.append({
                    "type": "text",
                    "content": page["text"],
                    "page": page["page"],
                    "metadata": page.get("metadata", {})
                })
            
            # 处理表格内容
            if "tables" in page:
                for table in page["tables"]:
                    parsed_content.append({
                        "type": "table",
                        "content": self._convert_table_to_markdown(table),
                        "page": page["page"],
                        "metadata": {
                            "table_index": table.get("index", 0),
                            "rows": len(table.get("data", [])),
                            "columns": len(table.get("data", [[]])[0]) if table.get("data") else 0
                        }
                    })
            
            # 处理图片内容
            if "images" in page:
                for image in page["images"]:
                    parsed_content.append({
                        "type": "image",
                        "content": self._extract_text_from_image(image),
                        "page": page["page"],
                        "metadata": {
                            "image_index": image.get("index", 0),
                            "image_type": image.get("type", "unknown"),
                            "ocr_confidence": image.get("ocr_confidence", 0)
                        }
                    })
        
        return parsed_content

    def _parse_by_pages(self, page_map: list) -> list:
        """
        逐页解析文档，保持页面边界，包括表格和图片内容
        """
        parsed_content = []
        for page in page_map:
            page_content = {
                "type": "page",
                "content": "",
                "page": page["page"],
                "metadata": page.get("metadata", {})
            }
            
            # 添加文本内容
            if "text" in page:
                page_content["content"] += page["text"] + "\n"
            
            # 添加表格内容
            if "tables" in page:
                for table in page["tables"]:
                    page_content["content"] += self._convert_table_to_markdown(table) + "\n"
            
            # 添加图片内容
            if "images" in page:
                for image in page["images"]:
                    page_content["content"] += self._extract_text_from_image(image) + "\n"
            
            parsed_content.append(page_content)
        
        return parsed_content

    def _parse_by_titles(self, page_map: list) -> list:
        """
        通过识别标题来解析文档并将内容组织成章节，包括表格和图片内容
        """
        parsed_content = []
        current_title = None
        current_content = []
        current_page = 1

        for page in page_map:
            lines = page["text"].split('\n')
            for line in lines:
                if len(line.strip()) < 60 and line.isupper():
                    if current_title:
                        parsed_content.append({
                            "type": "section",
                            "content": "\n".join(item["content"] for item in current_content),
                            "page": current_page,
                            "metadata": {
                                "title": current_title,
                                "content_count": len(current_content)
                            }
                        })
                    current_title = line.strip()
                    current_content = []
                    current_page = page["page"]
                else:
                    current_content.append({
                        "type": "text",
                        "content": line
                    })
            
            # 添加当前页的表格和图片
            if "tables" in page:
                for table in page["tables"]:
                    current_content.append({
                        "type": "table",
                        "content": self._convert_table_to_markdown(table)
                    })
            
            if "images" in page:
                for image in page["images"]:
                    current_content.append({
                        "type": "image",
                        "content": self._extract_text_from_image(image)
                    })

        # 添加最后一个章节
        if current_title:
            parsed_content.append({
                "type": "section",
                "content": "\n".join(item["content"] for item in current_content),
                "page": current_page,
                "metadata": {
                    "title": current_title,
                    "content_count": len(current_content)
                }
            })

        return parsed_content

    def _parse_text_and_tables(self, page_map: list) -> list:
        """
        分离文本、表格和图片内容，并将表格转换为 Markdown 格式
        """
        parsed_content = []
        for page in page_map:
            # 处理文本内容
            if "text" in page:
                parsed_content.append({
                    "type": "text",
                    "content": page["text"],
                    "page": page["page"],
                    "metadata": page.get("metadata", {})
                })
            
            # 处理表格内容
            if "tables" in page:
                for table in page["tables"]:
                    # 确保表格数据存在
                    if not table.get("data"):
                        continue
                        
                    # 转换表格为 Markdown 格式
                    markdown_table = self._convert_table_to_markdown(table)
                    
                    parsed_content.append({
                        "type": "table",
                        "content": markdown_table,
                        "page": page["page"],
                        "metadata": {
                            "table_index": table.get("index", 0),
                            "rows": len(table.get("data", [])),
                            "columns": len(table.get("data", [[]])[0]) if table.get("data") else 0,
                            "original_format": "markdown"
                        }
                    })
            
            # 处理图片内容
            if "images" in page:
                for image in page["images"]:
                    parsed_content.append({
                        "type": "image",
                        "content": self._extract_text_from_image(image),
                        "page": page["page"],
                        "metadata": {
                            "image_index": image.get("index", 0),
                            "image_type": image.get("type", "unknown"),
                            "ocr_confidence": image.get("ocr_confidence", 0)
                        }
                    })
        
        return parsed_content

    def _convert_table_to_markdown(self, table: dict) -> str:
        """
        将表格数据转换为 Markdown 格式
        """
        if not table.get("data"):
            return ""
        
        data = table["data"]
        if not data or not isinstance(data, list) or not data[0]:
            return ""
        
        markdown_lines = []
        
        # 添加表头
        header = data[0]
        markdown_lines.append("| " + " | ".join(str(cell).strip() for cell in header) + " |")
        
        # 添加分隔行
        markdown_lines.append("| " + " | ".join(["---"] * len(header)) + " |")
        
        # 添加数据行
        for row in data[1:]:
            if not row:  # 跳过空行
                continue
            # 确保每行的单元格数量与表头一致
            row_cells = row + [""] * (len(header) - len(row)) if len(row) < len(header) else row[:len(header)]
            markdown_lines.append("| " + " | ".join(str(cell).strip() for cell in row_cells) + " |")
        
        return "\n".join(markdown_lines)

    def _extract_text_from_image(self, image: dict) -> str:
        """
        从图片中提取文本内容
        """
        try:
            if "image_data" in image:
                # 如果图片数据是base64编码的
                image_data = base64.b64decode(image["image_data"])
                img = Image.open(io.BytesIO(image_data))
            elif "image_path" in image:
                # 如果提供了图片路径
                img = Image.open(image["image_path"])
            else:
                return ""
            
            # 使用pytesseract进行OCR
            text = pytesseract.image_to_string(img)
            return text.strip()
            
        except Exception as e:
            logger.error(f"Error extracting text from image: {str(e)}")
            return ""

    def parse_with_unstructured(self, file_path: str, method: str = "all_text") -> dict:
        """
        使用 unstructured 库解析文档
        """
        try:
            file_extension = file_path.lower().split('.')[-1]
            
            if file_extension == 'pdf':
                elements = partition_pdf(file_path)
            elif file_extension in ['md', 'markdown']:
                elements = partition_md(file_path)
            elif file_extension in ['jpg', 'jpeg', 'png', 'bmp', 'tiff']:
                elements = partition_image(file_path)
            else:
                raise ValueError(f"Unsupported file type: {file_extension}")
            
            # 构建 page_map
            page_map = []
            current_page = 1
            
            for elem in elements:
                metadata = elem.metadata.__dict__
                page_number = metadata.get('page_number', current_page)
                
                # 清理元数据
                cleaned_metadata = {}
                for key, value in metadata.items():
                    if key == '_known_field_names':
                        continue
                    try:
                        json.dumps({key: value})
                        cleaned_metadata[key] = value
                    except (TypeError, OverflowError):
                        cleaned_metadata[key] = str(value)
                
                # 添加元素信息
                cleaned_metadata['element_type'] = elem.__class__.__name__
                cleaned_metadata['id'] = str(getattr(elem, 'id', None))
                cleaned_metadata['category'] = str(getattr(elem, 'category', None))
                
                # 根据元素类型处理内容
                if elem.category == "Table":
                    # 将表格数据转换为标准格式
                    table_data = self._convert_unstructured_table(elem)
                    page_map.append({
                        "page": page_number,
                        "tables": [{
                            "data": table_data,
                            "metadata": cleaned_metadata
                        }]
                    })
                elif elem.category == "Image":
                    page_map.append({
                        "page": page_number,
                        "images": [{
                            "image_data": self._get_image_data(elem),
                            "metadata": cleaned_metadata
                        }]
                    })
                else:
                    page_map.append({
                        "page": page_number,
                        "text": str(elem),
                        "metadata": cleaned_metadata
                    })
            
            return self.parse_pdf("", method, {"filename": file_path}, page_map)
            
        except Exception as e:
            logger.error(f"Error in parse_with_unstructured: {str(e)}")
            raise

    def _convert_unstructured_table(self, table_elem) -> list:
        """
        将 unstructured 表格元素转换为标准表格数据格式
        """
        try:
            # 获取表格的行和列
            rows = []
            if hasattr(table_elem, 'rows'):
                for row in table_elem.rows:
                    # 获取每个单元格的文本
                    cells = []
                    for cell in row:
                        if hasattr(cell, 'text'):
                            cells.append(cell.text.strip())
                        else:
                            cells.append(str(cell).strip())
                    rows.append(cells)
            
            # 如果没有行，尝试其他方法获取表格数据
            if not rows and hasattr(table_elem, 'text'):
                # 尝试从文本中解析表格
                lines = table_elem.text.strip().split('\n')
                for line in lines:
                    if line.strip():
                        # 假设单元格由制表符或空格分隔
                        cells = [cell.strip() for cell in line.split('\t') if cell.strip()]
                        if cells:
                            rows.append(cells)
            
            return rows
        except Exception as e:
            logger.error(f"Error converting unstructured table: {str(e)}")
            return []

    def _get_image_data(self, image_elem) -> str:
        """
        从unstructured图片元素中获取图片数据
        """
        try:
            # 这里需要根据实际的unstructured图片元素结构来实现
            # 这是一个示例实现
            if hasattr(image_elem, 'image'):
                return base64.b64encode(image_elem.image).decode('utf-8')
            return ""
        except Exception as e:
            logger.error(f"Error getting image data: {str(e)}")
            return "" 