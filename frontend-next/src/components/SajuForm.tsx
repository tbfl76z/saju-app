"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";

interface SajuFormProps {
    onCalculate: (data: any) => void;
    isLoading: boolean;
}

export function SajuForm({ onCalculate, isLoading }: SajuFormProps) {
    const [formData, setFormData] = useState({
        name: "하늘",
        gender: "여",
        year: 1990,
        month: 1,
        day: 1,
        hour: 0,
        minute: 0,
        calendar_type: "양력",
        is_leap: false,
    });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onCalculate(formData);
    };

    return (
        <Card className="w-full max-w-2xl mx-auto bg-white/50 backdrop-blur-sm border-[#d4af37]/30 shadow-xl">
            <CardContent className="pt-6">
                <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="name">이름 (선택)</Label>
                            <Input
                                id="name"
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                placeholder="홍길동"
                                className="border-[#d4af37]/20 focus:border-[#d4af37]"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>성별</Label>
                            <Select
                                value={formData.gender}
                                onValueChange={(val) => setFormData({ ...formData, gender: val })}
                            >
                                <SelectTrigger className="border-[#d4af37]/20">
                                    <SelectValue placeholder="성별 선택" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="여">여성</SelectItem>
                                    <SelectItem value="남">남성</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label className="flex items-center gap-2">📅 생년월일</Label>
                        <div className="grid grid-cols-3 gap-2">
                            <Input
                                type="number"
                                value={formData.year}
                                onChange={(e) => setFormData({ ...formData, year: parseInt(e.target.value) })}
                                min={1900}
                                max={2100}
                                className="border-[#d4af37]/20"
                            />
                            <Input
                                type="number"
                                value={formData.month}
                                onChange={(e) => setFormData({ ...formData, month: parseInt(e.target.value) })}
                                min={1}
                                max={12}
                                className="border-[#d4af37]/20"
                            />
                            <Input
                                type="number"
                                value={formData.day}
                                onChange={(e) => setFormData({ ...formData, day: parseInt(e.target.value) })}
                                min={1}
                                max={31}
                                className="border-[#d4af37]/20"
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label className="flex items-center gap-2">⏰ 태어난 시간</Label>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="flex items-center gap-2">
                                <Input
                                    type="number"
                                    value={formData.hour}
                                    onChange={(e) => setFormData({ ...formData, hour: parseInt(e.target.value) })}
                                    min={0}
                                    max={23}
                                    className="border-[#d4af37]/20"
                                />
                                <span className="text-sm text-muted-foreground whitespace-nowrap">시</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <Input
                                    type="number"
                                    value={formData.minute}
                                    onChange={(e) => setFormData({ ...formData, minute: parseInt(e.target.value) })}
                                    min={0}
                                    max={59}
                                    className="border-[#d4af37]/20"
                                />
                                <span className="text-sm text-muted-foreground whitespace-nowrap">분</span>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>달력 선택</Label>
                            <Select
                                value={formData.calendar_type}
                                onValueChange={(val) => setFormData({ ...formData, calendar_type: val })}
                            >
                                <SelectTrigger className="border-[#d4af37]/20">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="양력">양력</SelectItem>
                                    <SelectItem value="음력">음력</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        {formData.calendar_type === "음력" && (
                            <div className="flex items-center space-x-2 pt-8">
                                <input
                                    type="checkbox"
                                    id="is_leap"
                                    checked={formData.is_leap}
                                    onChange={(e) => setFormData({ ...formData, is_leap: e.target.checked })}
                                    className="w-4 h-4 text-[#d4af37] border-gray-300 rounded focus:ring-[#d4af37]"
                                />
                                <Label htmlFor="is_leap">음력 윤달 여부</Label>
                            </div>
                        )}
                    </div>

                    <Button
                        type="submit"
                        disabled={isLoading}
                        className="w-full bg-[#d4af37] hover:bg-[#bfa02d] text-white font-bold py-6 rounded-lg text-lg shadow-lg transition-all hover:scale-[1.01]"
                    >
                        {isLoading ? "운명의 지도를 그리는 중..." : "사주 명식 계산하기"}
                    </Button>
                </form>
            </CardContent>
        </Card>
    );
}
