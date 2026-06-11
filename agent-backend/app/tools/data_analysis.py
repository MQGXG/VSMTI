import io
import base64
import pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from app.tools.base import BaseTool, ToolParam, ToolResult


class DataAnalysisTool(BaseTool):
    name = "data_analysis"
    description = "分析数据并生成图表"
    parameters = [
        ToolParam(name="data_source", type="string", description="数据源（文件路径或CSV文本）"),
        ToolParam(name="analysis_type", type="string", description="分析类型: summary/correlation/trend/distribution", required=False),
        ToolParam(name="chart_type", type="string", description="图表类型: line/bar/pie/scatter", required=False),
    ]

    async def execute(self, data_source: str = "", analysis_type: str = "summary", chart_type: str = "bar", **kwargs) -> ToolResult:
        try:
            if data_source.endswith(".csv"):
                df = pd.read_csv(data_source)
            else:
                from io import StringIO
                df = pd.read_csv(StringIO(data_source))

            result = ""
            if analysis_type == "summary":
                result = df.describe().to_string()
            elif analysis_type == "correlation":
                numeric_df = df.select_dtypes(include="number")
                if not numeric_df.empty:
                    result = numeric_df.corr().to_string()
                else:
                    result = "没有数值列用于相关性分析"
            elif analysis_type == "trend":
                result = f"数据形状: {df.shape}\n列: {list(df.columns)}"
            else:
                result = f"数据形状: {df.shape}\n列: {list(df.columns)}"

            fig, ax = plt.subplots(figsize=(10, 6))
            numeric_df = df.select_dtypes(include="number")
            if not numeric_df.empty:
                if chart_type == "bar":
                    numeric_df.head(20).plot(kind="bar", ax=ax)
                elif chart_type == "line":
                    numeric_df.plot(kind="line", ax=ax)
                elif chart_type == "scatter" and len(numeric_df.columns) >= 2:
                    numeric_df.plot(kind="scatter", x=numeric_df.columns[0], y=numeric_df.columns[1], ax=ax)
                else:
                    numeric_df.head(20).plot(kind="bar", ax=ax)
            else:
                ax.text(0.5, 0.5, "无数值列可绘图", ha="center", va="center", transform=ax.transAxes)

            plt.tight_layout()
            buf = io.BytesIO()
            plt.savefig(buf, format="png", dpi=150)
            buf.seek(0)
            chart_b64 = base64.b64encode(buf.read()).decode()
            plt.close()

            return ToolResult(
                success=True,
                output=f"数据分析结果:\n{result}\n\n![图表](data:image/png;base64,{chart_b64})",
            )
        except Exception as e:
            return ToolResult(success=False, output="", error=str(e))
