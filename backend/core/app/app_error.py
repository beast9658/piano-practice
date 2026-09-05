class AppError(Exception):
    def __init__(self, message: str, status_code: int = 400) -> None:
        super().__init__(message)
        self.message = message
        self.status_code = status_code

    @classmethod
    def validation(cls, message: str) -> "AppError":
        return cls(message, 400)

    @classmethod
    def not_found(cls, message: str) -> "AppError":
        return cls(message, 404)

    @classmethod
    def upstream(cls, message: str) -> "AppError":
        return cls(message, 502)
