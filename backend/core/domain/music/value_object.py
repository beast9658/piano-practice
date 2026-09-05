from dataclasses import dataclass


@dataclass(frozen=True)
class MusicPieceId:
    value: str

    @classmethod
    def parse(cls, value: str) -> "MusicPieceId":
        value = value.strip()
        if not value:
            raise ValueError("music: invalid id")
        return cls(value)


@dataclass(frozen=True)
class ArrangementId:
    value: str

    @classmethod
    def parse(cls, value: str) -> "ArrangementId":
        value = value.strip()
        if not value:
            raise ValueError("music: invalid arrangement id")
        return cls(value)
